import { Room, RoomEvent } from 'livekit-client'
import { api } from '../api'
import { DemoMusic, initVoices, playAlertSound } from '../speech'
import type { AudioStatus, AudioTransport, SpeechEvent } from './transport'

export function createLiveKitTransport(): AudioTransport {
  const music = new DemoMusic()
  let room: Room | null = null
  let started = false
  let status: AudioStatus = {
    supported: true,
    listening: false,
    speaking: false,
    micBlocked: false,
    sttSource: 'none',
    lastError: null,
  }

  const statusCbs = new Set<(s: AudioStatus) => void>()
  const speechCbs = new Set<(e: SpeechEvent) => void>()

  const setStatus = (patch: Partial<AudioStatus>) => {
    status = { ...status, ...patch }
    statusCbs.forEach((cb) => cb(status))
  }

  const emit = (e: SpeechEvent) => speechCbs.forEach((cb) => cb(e))

  const ensureRoom = async () => {
    if (room) return room

    const tokenRes = await api.getLiveKitToken()
    const roomInstance = new Room({
      adaptiveStream: true,
      dynacast: true,
      audioCaptureDefaults: {
        autoGainControl: true,
        echoCancellation: true,
        noiseSuppression: true,
      },
    })

    roomInstance.on(RoomEvent.Connected, () => {
      setStatus({ listening: true, speaking: false, sttSource: 'none' })
    })
    roomInstance.on(RoomEvent.Disconnected, () => {
      setStatus({ listening: false, speaking: false, sttSource: 'none' })
    })
    roomInstance.on(RoomEvent.LocalTrackPublished, () => {
      setStatus({ listening: true })
    })
    roomInstance.on(RoomEvent.TrackSubscribed, () => {
      setStatus({ speaking: true, listening: false })
      emit({ kind: 'speechstart' })
    })
    roomInstance.on(RoomEvent.TrackUnsubscribed, () => {
      setStatus({ speaking: false })
    })
    await roomInstance.connect(tokenRes.url, tokenRes.token, { autoSubscribe: true })
    await roomInstance.localParticipant.setMicrophoneEnabled(true)
    room = roomInstance
    setStatus({
      supported: true,
      listening: true,
      speaking: false,
      micBlocked: false,
      sttSource: 'none',
      lastError: null,
    })
    return room
  }

  return {
    name: 'livekit',
    get supported() {
      return true
    },
    async start() {
      if (started) return
      started = true
      setStatus({ supported: true, listening: false, speaking: false, micBlocked: false, sttSource: 'none', lastError: null })
      initVoices()
      try {
        await ensureRoom()
      } catch (error) {
        const message = error instanceof Error ? error.message : 'LiveKit session could not start'
        setStatus({ lastError: message, listening: false, speaking: false })
        emit({ kind: 'error', error: message })
      }
    },
    stop() {
      started = false
      if (room) {
        room.localParticipant.setMicrophoneEnabled(false).catch(() => {})
        room.disconnect()
        room = null
      }
      music.stop()
      setStatus({ listening: false, speaking: false, sttSource: 'none' })
    },
    ask() {
      // LiveKit room handles the mic lifecycle; the driver speaks naturally
      // into the connected room and the agent is responsible for turn-taking.
    },
    setLanguage() {
      // LiveKit room language is managed by the remote agent; no local toggle needed.
    },
    stopListening() {
      // Let the room remain live; listening is continuous in the real-time agent mode.
    },
    speak(_text, opts) {
      // No local browser TTS. The agent speaks through the room's remote audio track.
      opts?.onEnd?.()
    },
    playRemoteAudio(base64, format, onEnd) {
      const mime = format === 'mp3' ? 'audio/mpeg' : 'audio/wav'
      const audio = new Audio(`data:${mime};base64,${base64 ?? ''}`)
      audio.onended = () => {
        setStatus({ speaking: false })
        onEnd?.()
      }
      audio.onerror = () => {
        setStatus({ speaking: false })
        onEnd?.()
      }
      setStatus({ speaking: true })
      void audio.play().catch(() => {
        setStatus({ speaking: false })
        onEnd?.()
      })
    },
    stopSpeaking() {
      room?.localParticipant.setMicrophoneEnabled(false).catch(() => {})
      setStatus({ speaking: false })
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
