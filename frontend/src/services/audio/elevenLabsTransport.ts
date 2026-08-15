import { Conversation } from '@elevenlabs/client'
import { api } from '../api'
import { DemoMusic, createRecognition, hasSpeechRecognition, initVoices, playAlertSound } from '../speech'
import type { AudioStatus, AudioTransport, SpeechEvent } from './transport'

export function createElevenLabsTransport(
  onToolCall?: (toolName: string, parameters: any) => void
): AudioTransport {
  const music = new DemoMusic()
  let conversation: any = null
  let started = false
  let rec: ReturnType<typeof createRecognition> | null = null

  let status: AudioStatus = {
    supported: true,
    listening: false,
    speaking: false,
    micBlocked: false,
    sttSource: 'browser',
    lastError: null,
  }

  const statusCbs = new Set<(s: AudioStatus) => void>()
  const speechCbs = new Set<(e: SpeechEvent) => void>()

  const setStatus = (patch: Partial<AudioStatus>) => {
    status = { ...status, ...patch }
    statusCbs.forEach((cb) => cb(status))
  }

  const emit = (e: SpeechEvent) => speechCbs.forEach((cb) => cb(e))

  const ensureBackgroundVAD = () => {
    if (!hasSpeechRecognition()) return
    if (!rec) {
      rec = createRecognition({
        language: 'en-US',
        onStart: () => {},
        onEnd: () => { if (started) rec?.start() },
        onSpeechStart: () => emit({ kind: 'speechstart' }),
        onResult: (finalText: string, interimText: string, confidence?: number) => {
          if (finalText) emit({ kind: 'result', finalText, interimText, confidence })
        },
        onError: () => {}
      })
    }
    try { rec.start() } catch { /* ignore */ }
  }

  return {
    name: 'elevenlabs',
    get supported() {
      return true
    },
    async start() {
      if (started) return
      started = true
      setStatus({ supported: true, micBlocked: false, lastError: null })
      
      initVoices() // warmup browser TTS just in case for fallbacks
      ensureBackgroundVAD() // run local ASR just to feed fatigue engine events (speechstart)

      try {
        // Fetch signed url from backend
        const { signed_url } = await api.getElevenLabsToken()
        
        conversation = await Conversation.startSession({
          signedUrl: signed_url,
          onConnect: () => {
            setStatus({ listening: true, speaking: false })
          },
          onDisconnect: () => {
            setStatus({ listening: false, speaking: false })
          },
          onError: (error: any) => {
            setStatus({ lastError: error.message || String(error) })
            emit({ kind: 'error', error: error.message || String(error) })
          },
          onModeChange: (modeInfo: any) => {
            const mode = typeof modeInfo === 'string' ? modeInfo : modeInfo.mode
            if (mode === 'speaking') {
              setStatus({ speaking: true, listening: false })
              // Agent started speaking. The manager intercepts this to measure prompt timestamp.
              emit({ kind: 'result', finalText: '(AI speaking)' }) 
            } else if (mode === 'listening') {
              setStatus({ speaking: false, listening: true })
            }
          },
          clientTools: {
            play_music: (parameters: any) => {
              music.start()
              if (onToolCall) onToolCall('play_music', parameters)
            },
            offer_music: (parameters: any) => {
              if (onToolCall) onToolCall('offer_music', parameters)
            }
          }
        })
      } catch (error: any) {
        setStatus({ lastError: error.message || 'Failed to start ElevenLabs session' })
      }
    },
    stop() {
      started = false
      music.stop()
      if (rec) {
        rec.stop()
        rec = null
      }
      if (conversation) {
        conversation.endSession()
        conversation = null
      }
      setStatus({ listening: false, speaking: false, sttSource: 'none' })
    },
    ask() {
      // ElevenLabs is continuous WebRTC, no manual ask needed
    },
    setLanguage(_language: string) {
      // Language is managed by the ElevenLabs agent model
    },
    stopListening() {
      // Handled natively by WebRTC
    },
    speak(_text: string, opts?: { rate?: number; onEnd?: () => void }) {
      // If we MUST speak manually, ElevenLabs Conv AI might not expose an easy imperative speak
      // without using the chat API. We'll no-op and let the agent manage conversation.
      if (opts?.onEnd) opts.onEnd()
    },
    playRemoteAudio(_base64: string, _format: string, onEnd?: () => void) {
      if (onEnd) onEnd()
    },
    stopSpeaking() {
      // Managed by SDK
    },
    playMusic() {
      music.start()
    },
    stopMusic() {
      music.stop()
    },
    setMusicVolume(v: number) {
      music.setVolume(v)
    },
    alert() {
      playAlertSound()
    },
    onStatus(cb: (s: AudioStatus) => void) {
      statusCbs.add(cb)
      cb(status)
      return () => statusCbs.delete(cb)
    },
    onSpeech(cb: (e: SpeechEvent) => void) {
      speechCbs.add(cb)
      return () => speechCbs.delete(cb)
    }
  }
}
