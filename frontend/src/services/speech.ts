// Browser-native speech helpers. Everything degrades gracefully:
// no SpeechRecognition  -> the UI falls back to a typed answer
// no SpeechSynthesis    -> questions are shown as text only

export interface RecognitionHandle {
  start: () => void
  stop: () => void
  isSupported: boolean
  /** the recognition language this handle is configured for */
  lang: string
}

type SR = {
  new (): SpeechRecognitionLike
}

interface SpeechRecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  onstart: (() => void) | null
  onend: (() => void) | null
  onerror: ((e: { error: string }) => void) | null
  onresult: ((e: {
    resultIndex: number
    results: ArrayLike<
      ArrayLike<{ transcript: string; confidence?: number }> & { isFinal: boolean }
    >
  }) => void) | null
  onspeechstart: (() => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}

export function createRecognition(
  handlers: {
    onStart?: () => void
    onEnd?: () => void
    onSpeechStart?: () => void
    onResult: (finalTranscript: string, interimTranscript: string, confidence?: number) => void
    onError?: (error: string) => void
    language?: string
  },
): RecognitionHandle {
  const w = window as unknown as {
    SpeechRecognition?: SR
    webkitSpeechRecognition?: SR
  }
  const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition
  if (!Ctor) {
    return { start: () => {}, stop: () => {}, isSupported: false, lang: handlers.language || 'en-US' }
  }

  const rec = new Ctor()
  let shouldRestart = false
  let restartFailures = 0

  rec.lang = handlers.language || 'en-US'
  rec.continuous = true
  rec.interimResults = true
  rec.maxAlternatives = 1

  rec.onstart = () => {
    shouldRestart = true
    restartFailures = 0
    handlers.onStart?.()
  }
  rec.onend = () => {
    handlers.onEnd?.()
    if (!shouldRestart) return
    // Restart with a small backoff. Chrome can reject a restart that comes
    // too fast ("already started" / "invalid state"); retrying a few times
    // keeps the mic alive instead of dying silently forever. After sustained
    // real failures we give up and surface 'restart-failed' so the transport
    // can fall back to the Sarvam capture.
    restartFailures += 1
    const tryStart = () => {
      if (!shouldRestart) return
      try {
        rec.start()
      } catch (err) {
        // Already running (start raced with an onend) — treat as success.
        if (err instanceof DOMException && (err.name === 'InvalidStateError' || err.name === 'InvalidModificationError')) {
          restartFailures = 0
          return
        }
        if (restartFailures >= 6) {
          shouldRestart = false
          handlers.onError?.('restart-failed')
          return
        }
        restartFailures += 1
        window.setTimeout(tryStart, Math.min(900, 150 * restartFailures))
      }
    }
    window.setTimeout(tryStart, Math.min(900, 150 * restartFailures))
  }
  rec.onspeechstart = () => handlers.onSpeechStart?.()
  rec.onerror = (e) => {
    // Transient / environmental codes must NOT kill the microphone: keep
    // listening and restart. Only hard permission failures stop the loop.
    const transient = ["no-speech", "aborted", "network", "audio-capture"].includes(e.error)
    if (transient) {
      shouldRestart = true
      // surface soft errors (no-speech is expected — skip it)
      if (e.error !== "no-speech") handlers.onError?.(e.error)
      return
    }
    shouldRestart = false
    handlers.onError?.(e.error)
  }

  rec.onresult = (e) => {
    let final = ''
    let interim = ''
    let confidence: number | undefined
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const result = e.results[i]
      if (result.isFinal) {
        final += result[0].transcript
        confidence = typeof result[0].confidence === 'number' ? result[0].confidence : confidence
      } else {
        interim += result[0].transcript
      }
    }
    if (final || interim) handlers.onResult(final, interim, confidence)
  }

  return {
    start: () => {
      shouldRestart = true
      restartFailures = 0
      try {
        rec.start()
      } catch {
        /* already started — continuous recognition is running */
      }
    },
    stop: () => {
      shouldRestart = false
      try {
        rec.stop()
      } catch {
        /* noop */
      }
    },
    isSupported: true,
    lang: handlers.language || 'en-US',
  }
}

// ---------------------------------------------------------------------------
// Text to speech
// ---------------------------------------------------------------------------
let cachedVoices: SpeechSynthesisVoice[] = []

export function initVoices() {
  if (!('speechSynthesis' in window)) return
  cachedVoices = window.speechSynthesis.getVoices()
  window.speechSynthesis.onvoiceschanged = () => {
    cachedVoices = window.speechSynthesis.getVoices()
  }
}

// Deterministic preference order for natural-sounding voices. We scan for the
// first available voice matching any pattern (preferring en-US, falling back
// to any English voice, then to the platform default). These names cover the
// common natural voices across Chrome (Google), Edge (Microsoft Neural) and
// macOS (Samantha).
const VOICE_PREFERENCE: RegExp[] = [
  /google us english/i,
  /microsoft aria online \(natural\)/i,
  /microsoft jenny online \(natural\)/i,
  /microsoft (aria|jenny|guy|christopher|eric|ana) (online )?\(natural\)/i,
  /samantha/i,
  /google uk english/i,
  /natural/i,
  /google/i,
]

function pickVoice(): SpeechSynthesisVoice | null {
  const en = cachedVoices.filter((v) => v.lang.toLowerCase().startsWith('en'))
  for (const pattern of VOICE_PREFERENCE) {
    const hit =
      en.find((v) => v.lang.toLowerCase() === 'en-us' && pattern.test(v.name)) ||
      en.find((v) => pattern.test(v.name))
    if (hit) return hit
  }
  return en[0] ?? cachedVoices[0] ?? null
}

export function speak(text: string, opts?: { rate?: number; pitch?: number; onEnd?: () => void }) {
  if (!('speechSynthesis' in window)) {
    opts?.onEnd?.()
    return false
  }
  const clean = text.replace(/[\u2014\u2013]/g, ', ').replace(/\s{2,}/g, ' ').trim()
  const utter = new SpeechSynthesisUtterance(clean)
  utter.rate = opts?.rate ?? 0.98
  utter.pitch = opts?.pitch ?? 1.0
  const voice = pickVoice()
  if (voice) utter.voice = voice
  utter.onend = () => opts?.onEnd?.()
  utter.onerror = () => opts?.onEnd?.()
  window.speechSynthesis.cancel()
  window.speechSynthesis.speak(utter)
  return true
}

export function stopSpeaking() {
  if ('speechSynthesis' in window) window.speechSynthesis.cancel()
}

// ---------------------------------------------------------------------------
// Ambient "engine hum" pad — soft, slow, and low by default. Volume rises
// only when fatigue escalates (demo of the in-car audio integration). This
// replaces the earlier fast arpeggio, which was too busy to sit in the
// background comfortably.
// ---------------------------------------------------------------------------
export class DemoMusic {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private filter: BiquadFilterNode | null = null
  private timer: number | null = null
  private step = 0
  private _volume = 0.05

  get volume() {
    return this._volume
  }

  setVolume(v: number) {
    this._volume = Math.max(0, Math.min(1, v))
    if (this.master) this.master.gain.value = this._volume
  }

  start() {
    if (this.ctx) return
    const Ctor = window.AudioContext || (window as any).webkitAudioContext
    if (!Ctor) return
    this.ctx = new Ctor()
    this.master = this.ctx.createGain()
    this.master.gain.value = this._volume
    this.filter = this.ctx.createBiquadFilter()
    this.filter.type = 'lowpass'
    this.filter.frequency.value = 900
    this.filter.connect(this.master)
    this.master.connect(this.ctx.destination)
    this.timer = window.setInterval(() => this.tick(), 900)
  }

  stop() {
    if (this.timer) window.clearInterval(this.timer)
    this.timer = null
    this.ctx?.close().catch(() => {})
    this.ctx = null
    this.master = null
    this.filter = null
  }

  private tick() {
    if (!this.ctx || !this.master || !this.filter) return
    const freqs = [130.81, 164.81, 196.0] // low, slow-moving pad tones
    const osc = this.ctx.createOscillator()
    const gain = this.ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = freqs[this.step % freqs.length]
    const t = this.ctx.currentTime
    gain.gain.setValueAtTime(0, t)
    gain.gain.linearRampToValueAtTime(0.5, t + 0.4)
    gain.gain.linearRampToValueAtTime(0, t + 1.6)
    osc.connect(gain)
    gain.connect(this.filter)
    osc.start(t)
    osc.stop(t + 1.7)
    this.step += 1
  }
}

// Alert sound (WebAudio beeps) for critical fatigue / crash detection
export function playAlertSound() {
  const Ctor = window.AudioContext || (window as any).webkitAudioContext
  if (!Ctor) return
  const ctx = new Ctor()
  const notes = [880, 660, 880, 660]
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'square'
    osc.frequency.value = freq
    const t = ctx.currentTime + i * 0.28
    gain.gain.setValueAtTime(0.18, t)
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.24)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(t)
    osc.stop(t + 0.26)
  })
  setTimeout(() => ctx.close().catch(() => {}), 2000)
}

export function hasSpeechRecognition(): boolean {
  const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown }
  return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition)
}