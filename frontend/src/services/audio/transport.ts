/**
 * AudioTransport abstraction.
 *
 * Sleep Drive must not care WHERE audio comes from. In the web prototype the
 * transport is the browser microphone + speakers; in a production vehicle it
 * would be the car's Bluetooth audio pipeline (phone audio routed through the
 * head unit). The rest of the Sleep Drive system talks only to this interface,
 * so swapping transports later is a one-line change at the composition root.
 *
 *     AudioTransport
 *         ├── BrowserAudioTransport   (web prototype — this file)
 *         └── CarBluetoothTransport   (future native/automotive adapter)
 */
import {
  DemoMusic,
  createRecognition,
  hasSpeechRecognition,
  initVoices,
  playAlertSound,
} from '../speech'
import { SarvamVadCapture } from './sarvamCapture'

export interface AudioStatus {
  /** transport can operate in this environment */
  supported: boolean
  /** microphone is capturing right now */
  listening: boolean
  /** TTS is currently speaking */
  speaking: boolean
  /** mic permission explicitly blocked */
  micBlocked: boolean
  /** which speech recognizer is feeding the driver's voice in */
  sttSource: 'browser' | 'sarvam' | 'none'
  /** last error message, if any */
  lastError: string | null
}

export interface SpeechEvent {
  kind: 'start' | 'speechstart' | 'result' | 'end' | 'error'
  finalText?: string
  interimText?: string
  /** ASR confidence (0..1) when the browser provides it */
  confidence?: number
  error?: string
}

export interface AudioTransport {
  readonly name: string
  readonly supported: boolean
  /** begin a session: warm up voices + mic standby. NEVER starts music. */
  start(): void
  /** tear everything down (stops any consented music too) */
  stop(): void
  /** begin listening for a spoken response */
  ask(): void
  setLanguage(language: string): void
  stopListening(): void
  speak(text: string, opts?: { rate?: number; onEnd?: () => void }): void
  /** Play pre-synthesized audio (Sarvam TTS base64) instead of browser TTS.
   *  stopSpeaking() also stops any remote audio (barge-in). */
  playRemoteAudio(base64: string, format: string, onEnd?: () => void): void
  stopSpeaking(): void
  /** Music is an optional INTERVENTION. It plays ONLY after explicit driver
   *  consent — never on session start, fatigue, silence, or demo start. */
  playMusic(): void
  stopMusic(): void
  /** volume of already-consented music; no-op while music is stopped */
  setMusicVolume(v: number): void
  /** critical alert sound (only for HIGH_CONCERN, never routine) */
  alert(): void
  onStatus(cb: (s: AudioStatus) => void): () => void
  onSpeech(cb: (e: SpeechEvent) => void): () => void
}

/** Map browser SpeechRecognition error codes onto Sleep Drive event types. */
export function classifyRecognitionError(code: string): 'microphone_error' | 'asr_error' | null {
  if (code === 'not-allowed' || code === 'service-not-allowed' || code === 'audio-capture') {
    return 'microphone_error'
  }
  if (code === 'network' || code === 'aborted' || code === 'language-not-supported' || code === 'bad-grammar' || code === 'restart-failed') {
    return 'asr_error'
  }
  // 'no-speech' is NOT an error — the silence timer decides what it means.
  return null
}

// ---------------------------------------------------------------------------
// Browser transport
// ---------------------------------------------------------------------------

export class AudioPlaybackManager {
  private queue: Array<{ kind: 'browser' | 'remote'; text?: string; base64?: string; format?: string; rate?: number; onEnd?: () => void }> = []
  private active: { kind: 'browser' | 'remote'; handle: SpeechSynthesisUtterance | HTMLAudioElement | null; onEnd?: () => void } | null = null
  private audioContext: AudioContext | null = null
  private started = false

  ensureAudioContext() {
    if (typeof window === 'undefined') return null
    const Ctor = window.AudioContext || (window as any).webkitAudioContext
    if (!Ctor) return null
    if (!this.audioContext) this.audioContext = new Ctor()
    if (this.audioContext.state === 'suspended') void this.audioContext.resume()
    return this.audioContext
  }

  start() {
    this.started = true
    this.ensureAudioContext()
    initVoices()
  }

  stop() {
    this.started = false
    this.queue = []
    if (this.active?.kind === 'remote' && this.active.handle instanceof HTMLAudioElement) {
      this.active.handle.pause()
    }
    this.active = null
    if ('speechSynthesis' in window) window.speechSynthesis.cancel()
    if (this.audioContext && this.audioContext.state !== 'closed') {
      void this.audioContext.close().catch(() => {})
      this.audioContext = null
    }
  }

  private finishCurrent() {
    const current = this.active
    this.active = null
    current?.onEnd?.()
    const next = this.queue.shift()
    if (!next) return
    this.play(next)
  }

  private play(item: { kind: 'browser' | 'remote'; text?: string; base64?: string; format?: string; rate?: number; onEnd?: () => void }) {
    if (!this.started) {
      item.onEnd?.()
      return
    }
    this.ensureAudioContext()
    if (item.kind === 'browser') {
      if (!('speechSynthesis' in window)) {
        item.onEnd?.()
        return
      }
      const text = (item.text ?? '').trim()
      if (!text) {
        item.onEnd?.()
        return
      }
      const utter = new SpeechSynthesisUtterance(text)
      utter.rate = item.rate ?? 1.0
      utter.onend = () => {
        this.finishCurrent()
      }
      utter.onerror = () => {
        this.finishCurrent()
      }
      this.active = { kind: 'browser', handle: utter, onEnd: item.onEnd }
      window.speechSynthesis.cancel()
      window.speechSynthesis.speak(utter)
      return
    }
    const mime = item.format === 'mp3' ? 'audio/mpeg' : 'audio/wav'
    const audio = new Audio(`data:${mime};base64,${item.base64 ?? ''}`)
    audio.onended = () => {
      this.finishCurrent()
    }
    audio.onerror = () => {
      this.finishCurrent()
    }
    audio.play().catch(() => {
      this.finishCurrent()
    })
    this.active = { kind: 'remote', handle: audio, onEnd: item.onEnd }
  }

  enqueue(item: { kind: 'browser' | 'remote'; text?: string; base64?: string; format?: string; rate?: number; onEnd?: () => void }) {
    this.queue.push(item)
    if (!this.active) this.play(this.queue.shift()!)
  }

  interrupt() {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel()
    const current = this.active
    this.active = null
    if (current?.kind === 'remote' && current.handle instanceof HTMLAudioElement) {
      current.handle.pause()
    }
    this.queue = []
    current?.onEnd?.()
  }
}

export function createBrowserAudioTransport(): AudioTransport {
  const music = new DemoMusic()
  const playback = new AudioPlaybackManager()
  // Driver voice-in: Chromium's SpeechRecognition (low latency, interim
  // results) OR the Sarvam Saaras v3 capture (works in every browser).
  let useSarvamStt = !hasSpeechRecognition()
  let sarvam: SarvamVadCapture | null = null
  let status: AudioStatus = {
    supported: hasSpeechRecognition() || Boolean(navigator.mediaDevices?.getUserMedia),
    listening: false,
    speaking: false,
    micBlocked: false,
    sttSource: useSarvamStt ? 'none' : 'browser',
    lastError: null,
  }
  const statusCbs = new Set<(s: AudioStatus) => void>()
  const speechCbs = new Set<(e: SpeechEvent) => void>()
  let rec: ReturnType<typeof createRecognition> | null = null
  let started = false
  let currentLang = 'en-US'
  /** Chrome can re-deliver the same final result when a recognizer restarts.
   *  Ignore a final result that lands within this window of the previous one. */
  let lastFinalAt = 0
  const FINAL_DEDUPE_MS = 900

  const setStatus = (patch: Partial<AudioStatus>) => {
    status = { ...status, ...patch }
    statusCbs.forEach((cb) => cb(status))
  }

  const emit = (e: SpeechEvent) => speechCbs.forEach((cb) => cb(e))

  const ensureSarvamCapture = () => {
    if (!useSarvamStt || sarvam) return
    sarvam = new SarvamVadCapture({
      onEvent: emit,
      onStatus: (s) => setStatus({ listening: s.listening, micBlocked: s.micBlocked }),
    })
    void sarvam.start().then((ok) => {
      if (ok) setStatus({ sttSource: 'sarvam', listening: true })
      else setStatus({ sttSource: 'none', micBlocked: true })
    })
  }

  /** Fall back to the Sarvam Saaras capture when the browser recognizer
   *  hard-fails (permission is still fine — ASR itself broke). */
  const fallbackToSarvamCapture = () => {
    if (useSarvamStt || !navigator.mediaDevices?.getUserMedia) return
    useSarvamStt = true
    rec?.stop()
    rec = null
    ensureSarvamCapture()
  }

  const handleRecognitionError = (code: string) => {
    const kind = classifyRecognitionError(code)
    if (kind === 'microphone_error') {
      setStatus({ listening: false, micBlocked: true, lastError: code })
    } else if (kind === 'asr_error') {
      setStatus({ listening: false, lastError: code })
      // ASR broke while the mic permission is fine — keep listening via Sarvam.
      fallbackToSarvamCapture()
    } else {
      setStatus({ listening: false })
    }
    emit({ kind: 'error', error: code })
  }

  const makeRecognition = () =>
    createRecognition({
      language: currentLang,
      onStart: () => setStatus({ listening: true }),
      onEnd: () => setStatus({ listening: false }),
      onSpeechStart: () => emit({ kind: 'speechstart' }),
      onResult: (finalText, interimText, confidence) => {
        if (finalText) {
          const now = performance.now()
          if (now - lastFinalAt < FINAL_DEDUPE_MS) return
          lastFinalAt = now
        }
        emit({ kind: 'result', finalText, interimText, confidence })
      },
      onError: handleRecognitionError,
    })

  const ensureRecognition = () => {
    if (!rec) {
      rec = makeRecognition()
      return
    }
    if (rec.isSupported && currentLang && rec.lang !== currentLang) {
      rec.stop()
      rec = makeRecognition()
    }
  }

  return {
    name: 'browser',
    get supported() {
      return hasSpeechRecognition()
    },
    start() {
      if (started) return
      started = true
      playback.start()
      initVoices()
      if (useSarvamStt) ensureSarvamCapture()
      else ensureRecognition()
      setStatus({ supported: true, micBlocked: false, lastError: null })
    },
    stop() {
      started = false
      rec?.stop()
      sarvam?.stop()
      sarvam = null
      playback.stop()
      music.stop()
      setStatus({ listening: false, speaking: false })
    },
    playMusic: () => music.start(),
    stopMusic: () => music.stop(),
    ask() {
      if (!started) return
      if (useSarvamStt) {
        ensureSarvamCapture()
        return
      }
      if (!rec) ensureRecognition()
      if (!rec?.isSupported) return
      setStatus({ listening: true })
      try {
        rec.start()
      } catch {
        /* recognition already running */
      }
    },
    setLanguage(language) {
      currentLang = language || 'en-US'
      if (useSarvamStt) {
        ensureSarvamCapture()
        sarvam?.setLanguage(language)
        return
      }
      if (rec) {
        ensureRecognition()
      }
    },
    stopListening() {
      if (useSarvamStt) return // continuous VAD — the capture owns listening
      rec?.stop()
      setStatus({ listening: false })
    },
    speak(text, opts) {
      if (!started) return
      playback.enqueue({ kind: 'browser', text, rate: opts?.rate, onEnd: () => { setStatus({ speaking: false }); opts?.onEnd?.() } })
      setStatus({ speaking: true })
    },
    playRemoteAudio(base64, format, onEnd) {
      if (!started) return
      playback.enqueue({
        kind: 'remote',
        base64,
        format,
        onEnd: () => {
          setStatus({ speaking: false })
          onEnd?.()
        },
      })
      setStatus({ speaking: true })
    },
    stopSpeaking() {
      playback.interrupt()
      setStatus({ speaking: false })
    },
    setMusicVolume: (v) => music.setVolume(v),
    alert: playAlertSound,
    onStatus(cb) {
      statusCbs.add(cb)
      cb(status)
      return () => statusCbs.delete(cb)
    },
    onSpeech(cb) {
      speechCbs.add(cb)
      return () => speechCbs.delete(cb)
    },
  }
}

// ---------------------------------------------------------------------------
// Future car / Bluetooth transport (architecture seam — not built yet)
// ---------------------------------------------------------------------------

export class CarBluetoothTransport implements AudioTransport {
  readonly name = 'car-bluetooth'
  readonly supported = false
  private readonly cbs = new Set<(s: AudioStatus) => void>()

  private notify(s: AudioStatus) {
    this.cbs.forEach((cb) => cb(s))
  }

  start() {
    this.notify({ supported: false, listening: false, speaking: false, micBlocked: false, sttSource: 'none', lastError: 'native Bluetooth audio adapter not yet available in the web prototype' })
  }
  stop() {}
  ask() {}
  setLanguage() {}
  stopListening() {}
  speak() {}
  playRemoteAudio() {}
  stopSpeaking() {}
  playMusic() {}
  stopMusic() {}
  setMusicVolume() {}
  alert() {}
  onStatus(cb: (s: AudioStatus) => void) {
    this.cbs.add(cb)
    this.notify({ supported: false, listening: false, speaking: false, micBlocked: false, sttSource: 'none', lastError: null })
    return () => this.cbs.delete(cb)
  }
  onSpeech() {
    return () => {}
  }
}

import { createElevenLabsTransport } from './elevenLabsTransport'

/**
 * Composition root: swap to the car transport here in the native build.
 *
 * The primary voice stack is Groq (conversation) + Sarvam (STT/TTS) with
 * browser speech as input and browser-TTS fallback — see conversation/
 * manager.ts. The ElevenLabs Conversational agent transport is available as
 * an explicit opt-in (VITE_TRANSPORT=elevenlabs) for teams that run an agent;
 * it is NOT the default because it short-circuits the Groq/Sarvam pipeline.
 */
export function createAudioTransport(kind: 'browser' | 'car'): AudioTransport {
  if (kind === 'car') return new CarBluetoothTransport()
  try {
    if (import.meta.env.VITE_TRANSPORT === 'elevenlabs') {
      return createElevenLabsTransport()
    }
  } catch {
    /* import.meta.env unavailable — default to the browser transport */
  }
  return createBrowserAudioTransport()
}
