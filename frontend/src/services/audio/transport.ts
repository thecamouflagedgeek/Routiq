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
  speak as ttsSpeak,
  stopSpeaking as ttsStop,
} from '../speech'

export interface AudioStatus {
  /** transport can operate in this environment */
  supported: boolean
  /** microphone is capturing right now */
  listening: boolean
  /** TTS is currently speaking */
  speaking: boolean
  /** mic permission explicitly blocked */
  micBlocked: boolean
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
  stopListening(): void
  speak(text: string, opts?: { rate?: number; onEnd?: () => void }): void
  /** Play pre-synthesized audio (Sarvam TTS base64) instead of browser TTS.
   *  stopSpeaking() also stops any remote audio (barge-in). */
  playRemoteAudio(base64: string, format: string): void
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
  if (code === 'network' || code === 'aborted' || code === 'language-not-supported' || code === 'bad-grammar') {
    return 'asr_error'
  }
  // 'no-speech' is NOT an error — the silence timer decides what it means.
  return null
}

// ---------------------------------------------------------------------------
// Browser transport
// ---------------------------------------------------------------------------

export function createBrowserAudioTransport(): AudioTransport {
  const music = new DemoMusic()
  let status: AudioStatus = {
    supported: hasSpeechRecognition(),
    listening: false,
    speaking: false,
    micBlocked: false,
    lastError: null,
  }
  const statusCbs = new Set<(s: AudioStatus) => void>()
  const speechCbs = new Set<(e: SpeechEvent) => void>()
  let rec: ReturnType<typeof createRecognition> | null = null
  let started = false

  const setStatus = (patch: Partial<AudioStatus>) => {
    status = { ...status, ...patch }
    statusCbs.forEach((cb) => cb(status))
  }

  const emit = (e: SpeechEvent) => speechCbs.forEach((cb) => cb(e))

  const ensureRecognition = () => {
    if (rec) return
    rec = createRecognition({
      onStart: () => setStatus({ listening: true }),
      onEnd: () => setStatus({ listening: false }),
      onSpeechStart: () => emit({ kind: 'speechstart' }),
      onResult: (finalText, interimText, confidence) =>
        emit({ kind: 'result', finalText, interimText, confidence }),
      onError: (code) => {
        const kind = classifyRecognitionError(code)
        if (kind === 'microphone_error') {
          setStatus({ listening: false, micBlocked: true, lastError: code })
        } else if (kind === 'asr_error') {
          setStatus({ listening: false, lastError: code })
        } else {
          setStatus({ listening: false })
        }
        emit({ kind: 'error', error: code })
      },
    })
  }

  let remoteAudio: HTMLAudioElement | null = null

  return {
    name: 'browser',
    get supported() {
      return hasSpeechRecognition()
    },
    start() {
    if (started) return
    started = true
    initVoices()
    ensureRecognition()
    setStatus({ supported: true, micBlocked: false, lastError: null })
    // NOTE: deliberately NO music here — music requires explicit consent.
  },
    stop() {
      started = false
      rec?.stop()
      ttsStop()
      remoteAudio?.pause()
      remoteAudio = null
      music.stop()
      setStatus({ listening: false, speaking: false })
    },
    playMusic: () => music.start(),
    stopMusic: () => music.stop(),
    ask() {
      ensureRecognition()
      if (!rec?.isSupported) return
      setStatus({ listening: true })
      rec.start()
    },
    stopListening() {
      rec?.stop()
      setStatus({ listening: false })
    },
    speak(text, opts) {
      if (!started) return
      setStatus({ speaking: true })
      const done = () => {
        setStatus({ speaking: false })
        opts?.onEnd?.()
      }
      ttsSpeak(text, { rate: opts?.rate, onEnd: done })
    },
    playRemoteAudio(base64, format) {
      if (!started) return
      remoteAudio?.pause()
      const mime = format === 'mp3' ? 'audio/mpeg' : 'audio/wav'
      remoteAudio = new Audio(`data:${mime};base64,${base64}`)
      setStatus({ speaking: true })
      remoteAudio.onended = () => {
        setStatus({ speaking: false })
        remoteAudio = null
      }
      remoteAudio.onerror = () => {
        setStatus({ speaking: false })
        remoteAudio = null
      }
      remoteAudio.play().catch(() => {
        setStatus({ speaking: false })
        remoteAudio = null
      })
    },
    stopSpeaking() {
      ttsStop()
      remoteAudio?.pause()
      remoteAudio = null
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
    this.notify({ supported: false, listening: false, speaking: false, micBlocked: false, lastError: 'native Bluetooth audio adapter not yet available in the web prototype' })
  }
  stop() {}
  ask() {}
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
    this.notify({ supported: false, listening: false, speaking: false, micBlocked: false, lastError: null })
    return () => this.cbs.delete(cb)
  }
  onSpeech() {
    return () => {}
  }
}

/** Composition root: swap to the car transport here in the native build. */
export function createAudioTransport(kind: 'browser' | 'car'): AudioTransport {
  return kind === 'car' ? new CarBluetoothTransport() : createBrowserAudioTransport()
}
