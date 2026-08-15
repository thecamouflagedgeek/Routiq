/**
 * SarvamVadCapture — always-on microphone via Sarvam Saaras v3 STT.
 *
 * Browser SpeechRecognition only exists in Chromium. For Firefox, Safari and
 * any environment where webkitSpeechRecognition is unavailable or dies, this
 * capture takes over: it opens the mic with getUserMedia, runs a lightweight
 * VAD (RMS energy on a ScriptProcessor tap), records only the speech segment
 * as 16-bit PCM WAV, and sends it to `POST /api/fatigue/audio/transcribe`
 * (Sarvam Saaras v3). The transcript is emitted as a normal SpeechEvent, so
 * the ConversationManager never knows whether the words came from the
 * browser recognizer or from Sarvam — same turn-taking, same barge-in filter,
 * same response-latency measurement.
 *
 * Fail-safe: if the mic permission is denied the capture reports
 * `micBlocked` and stays quiet — silence is NEVER treated as fatigue (that
 * decision belongs to the fatigue engine, and it already handles it).
 */
import { api } from '../api'
import type { SpeechEvent } from './transport'

/** RMS threshold (0..1 normalized). Speech above this is "voice". */
const RMS_THRESHOLD = 0.02
/** sustained loudness (ms) before speech is considered started */
const SPEECH_START_MS = 350
/** sustained silence (ms) before the segment is finalized */
const SPEECH_END_MS = 1100
/** hard cap on a single segment (ms) — a long utterance is still sent */
const MAX_SEGMENT_MS = 15000
/** rolling buffer cap (ms) so memory stays bounded */
const ROLLING_CAP_MS = 15000

interface Chunk {
  at: number // samples written before this chunk
  data: Int16Array
}

export interface SarvamCaptureHandlers {
  onEvent: (e: SpeechEvent) => void
  onStatus?: (s: { listening: boolean; micBlocked: boolean }) => void
}

export class SarvamVadCapture {
  private stream: MediaStream | null = null
  private ctx: AudioContext | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private processor: ScriptProcessorNode | null = null
  private running = false
  private micBlocked = false
  private sampleRate = 16000
  private chunks: Chunk[] = []
  private totalSamples = 0
  private segmentStart: number | null = null
  private speechActive = false
  private speechStartTimer: number | null = null
  private silenceTimer: number | null = null
  private segmentTimer: number | null = null
  private transcribing = false
  private language = 'auto'
  private handlers: SarvamCaptureHandlers

  constructor(handlers: SarvamCaptureHandlers) {
    this.handlers = handlers
  }

  setLanguage(lang: string) {
    this.language = lang === 'auto' ? 'auto' : lang
  }

  /** Open the mic and start continuous VAD. Returns true when the mic is up. */
  async start(): Promise<boolean> {
    if (this.running) return true
    if (this.micBlocked) return false
    if (typeof window === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      this.micBlocked = true
      this.handlers.onStatus?.({ listening: false, micBlocked: true })
      return false
    }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      })
    } catch {
      this.micBlocked = true
      this.handlers.onStatus?.({ listening: false, micBlocked: true })
      this.handlers.onEvent({ kind: 'error', error: 'not-allowed' })
      return false
    }
    const Ctor = window.AudioContext || (window as any).webkitAudioContext
    if (!Ctor) {
      this.teardownStream()
      this.micBlocked = true
      this.handlers.onStatus?.({ listening: false, micBlocked: true })
      return false
    }
    this.ctx = new Ctor()
    this.sampleRate = this.ctx.sampleRate >= 44100 ? 16000 : Math.max(8000, this.ctx.sampleRate)
    this.source = this.ctx.createMediaStreamSource(this.stream)
    this.processor = this.ctx.createScriptProcessor(4096, 1, 1)
    this.source.connect(this.processor)
    this.processor.connect(this.ctx.destination)
    this.processor.onaudioprocess = (e) => this.onAudio(e.inputBuffer.getChannelData(0))
    this.running = true
    this.handlers.onStatus?.({ listening: true, micBlocked: false })
    return true
  }

  private onAudio(samples: Float32Array) {
    if (!this.running) return
    // compute RMS + downsample to 16k mono Int16
    const ratio = this.sampleRate / 16000
    const out = new Int16Array(Math.max(1, Math.floor(samples.length / ratio)))
    let sum = 0
    let oi = 0
    for (let i = 0; i < samples.length; i += ratio) {
      const s = samples[Math.min(samples.length - 1, Math.floor(i))]
      out[oi++] = Math.max(-32768, Math.min(32767, Math.round(s * 32767)))
      sum += s * s
    }
    const rms = Math.sqrt(sum / samples.length)
    this.pushChunk(out)

    if (rms > RMS_THRESHOLD) {
      if (!this.speechActive) {
        if (this.speechStartTimer == null) {
          this.speechStartTimer = window.setTimeout(() => {
            this.speechStartTimer = null
            if (this.running && !this.speechActive) this.beginSpeech()
          }, SPEECH_START_MS)
        }
      } else if (this.silenceTimer != null) {
        window.clearTimeout(this.silenceTimer)
        this.silenceTimer = null
      }
    } else {
      if (this.speechStartTimer != null) {
        window.clearTimeout(this.speechStartTimer)
        this.speechStartTimer = null
      }
      if (this.speechActive && this.silenceTimer == null) {
        this.silenceTimer = window.setTimeout(() => this.endSpeech(), SPEECH_END_MS)
      }
    }
  }

  private pushChunk(data: Int16Array) {
    this.chunks.push({ at: this.totalSamples, data })
    this.totalSamples += data.length
    const cap = (ROLLING_CAP_MS / 1000) * 16000
    while (this.totalSamples - this.chunks[0].at > cap) {
      // Evict the oldest chunk WITHOUT touching totalSamples: chunk `at`
      // positions are absolute, so totalSamples must stay the true stream
      // end. Decrementing it here made the next chunk's `at` overlap the
      // retained tail, so collect() could write past the end of its buffer
      // (RangeError: offset is out of bounds) and kill the fallback STT.
      this.chunks.shift()
    }
  }

  private beginSpeech() {
    if (this.speechActive || this.transcribing) return
    this.speechActive = true
    this.segmentStart = this.totalSamples
    this.handlers.onEvent({ kind: 'speechstart' })
    this.segmentTimer = window.setTimeout(() => this.endSpeech(), MAX_SEGMENT_MS)
  }

  private endSpeech() {
    if (this.silenceTimer != null) {
      window.clearTimeout(this.silenceTimer)
      this.silenceTimer = null
    }
    if (this.segmentTimer != null) {
      window.clearTimeout(this.segmentTimer)
      this.segmentTimer = null
    }
    if (!this.speechActive) return
    this.speechActive = false
    const start = this.segmentStart ?? this.totalSamples
    this.segmentStart = null
    const pcm = this.collect(start, this.totalSamples)
    if (pcm.length < 1600) return // < 100ms — too short to be speech
    this.transcribing = true
    void this.transcribe(pcm)
  }

  private collect(from: number, to: number): Int16Array {
    const out = new Int16Array(to - from)
    let o = 0
    for (const c of this.chunks) {
      const cFrom = Math.max(c.at, from)
      const cTo = Math.min(c.at + c.data.length, to)
      if (cTo > cFrom) out.set(c.data.subarray(cFrom - c.at, cTo - c.at), o)
      o += Math.max(0, cTo - cFrom)
    }
    return out
  }

  private async transcribe(pcm: Int16Array) {
    const wav = encodeWav(pcm, 16000)
    try {
      const res = await api.fatigueTranscribe(wav, this.language)
      const text = (res.transcript || '').trim()
      if (text) {
        this.handlers.onEvent({ kind: 'result', finalText: text })
      }
    } catch {
      /* transcription failed — stay listening, never raise fatigue */
    } finally {
      this.transcribing = false
    }
  }

  stop() {
    this.running = false
    if (this.speechStartTimer != null) window.clearTimeout(this.speechStartTimer)
    if (this.silenceTimer != null) window.clearTimeout(this.silenceTimer)
    if (this.segmentTimer != null) window.clearTimeout(this.segmentTimer)
    this.processor?.disconnect()
    this.source?.disconnect()
    this.ctx?.close().catch(() => {})
    this.teardownStream()
    this.processor = null
    this.source = null
    this.ctx = null
    this.chunks = []
    this.totalSamples = 0
    this.speechActive = false
    this.transcribing = false
    this.handlers.onStatus?.({ listening: false, micBlocked: this.micBlocked })
  }

  private teardownStream() {
    this.stream?.getTracks().forEach((t) => t.stop())
    this.stream = null
  }
}

/** Encode 16-bit mono PCM as a WAV blob (Sarvam Saaras v3 accepts WAV). */
export function encodeWav(samples: Int16Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2)
  const view = new DataView(buffer)
  const str = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i))
  }
  str(0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  str(8, 'WAVE')
  str(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  str(36, 'data')
  view.setUint32(40, samples.length * 2, true)
  new Int16Array(buffer, 44).set(samples)
  return new Blob([buffer], { type: 'audio/wav' })
}
