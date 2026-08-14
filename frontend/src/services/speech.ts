// Browser-native speech helpers. Everything degrades gracefully:
// no SpeechRecognition  -> the UI falls back to a typed answer
// no SpeechSynthesis    -> questions are shown as text only

export interface RecognitionHandle {
  start: () => void
  stop: () => void
  isSupported: boolean
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
    results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>
  }) => void) | null
  onspeechstart: (() => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}

export function createRecognition(handlers: {
  onStart?: () => void
  onEnd?: () => void
  onSpeechStart?: () => void
  onResult: (finalTranscript: string, interimTranscript: string) => void
  onError?: (error: string) => void
}): RecognitionHandle {
  const w = window as unknown as {
    SpeechRecognition?: SR
    webkitSpeechRecognition?: SR
  }
  const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition
  if (!Ctor) {
    return { start: () => {}, stop: () => {}, isSupported: false }
  }

  const rec = new Ctor()
  rec.lang = 'en-US'
  rec.continuous = true
  rec.interimResults = true
  rec.maxAlternatives = 1

  rec.onstart = () => handlers.onStart?.()
  rec.onend = () => handlers.onEnd?.()
  rec.onspeechstart = () => handlers.onSpeechStart?.()
  rec.onerror = (e) => handlers.onError?.(e.error)

  rec.onresult = (e) => {
    let final = ''
    let interim = ''
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const result = e.results[i]
      if (result.isFinal) final += result[0].transcript
      else interim += result[0].transcript
    }
    if (final || interim) handlers.onResult(final, interim)
  }

  return {
    start: () => {
      try {
        rec.start()
      } catch {
        /* already started */
      }
    },
    stop: () => {
      try {
        rec.stop()
      } catch {
        /* noop */
      }
    },
    isSupported: true,
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

export function speak(text: string, opts?: { rate?: number; pitch?: number; onEnd?: () => void }) {
  if (!('speechSynthesis' in window)) {
    opts?.onEnd?.()
    return false
  }
  window.speechSynthesis.cancel()
  const utter = new SpeechSynthesisUtterance(text)
  utter.rate = opts?.rate ?? 1.0
  utter.pitch = opts?.pitch ?? 1.0
  const preferred = cachedVoices.find(
    (v) => v.lang.startsWith('en') && v.name.toLowerCase().includes('natural'),
  ) || cachedVoices.find((v) => v.lang.startsWith('en') && v.name.toLowerCase().includes('google'))
  if (preferred) utter.voice = preferred
  utter.onend = () => opts?.onEnd?.()
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