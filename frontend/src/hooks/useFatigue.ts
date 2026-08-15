/**
 * useFatigue — thin React adapter around the ConversationManager.
 *
 * All conversational logic (turn-taking, barge-in, music consent, language,
 * pacing, history) lives in services/conversation/manager.ts. This hook only
 * wires the transport + engine + api into the manager and mirrors its state
 * into React for the UI. The fatigue engine itself is untouched.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DEFAULT_THRESHOLDS } from '../config'
import { api } from '../services/api'
import { classifyRecognitionError, createAudioTransport } from '../services/audio/transport'
import type { AudioTransport } from '../services/audio/transport'
import { ConversationManager } from '../services/conversation/manager'
import type { LatencyResult, ManagerState, SleepPhase } from '../services/conversation/types'
import { applyEvent, createEngineState, nextPrompt, toDriverState } from '../services/fatigue/engine'
import type { EngineState } from '../services/fatigue/engine'
import type {
  DriverState,
  FatigueEventType,
  FatigueThresholds,
  RoadContext,
} from '../types'

export type SleepMode = 'live' | 'demo'
export type { LatencyResult, SleepPhase }

const EMPTY_DRIVER: DriverState = {
  session_id: '',
  mode: 'live',
  state: 'NORMAL',
  fatigue_risk: 0.06,
  engagement: 0.94,
  confidence: 0,
  response_latency_ms: null,
  silence_detected: false,
  recent_delayed_responses: 0,
  slow_responses: 0,
  missed_responses: 0,
  baseline_latency_ms: null,
  baseline_samples: 0,
  last_interaction_at: null,
  evidence: [],
  conversation_state: 'IDLE',
  last_question: '',
  language: 'auto',
  last_intent: '',
  driver_initiated_count: 0,
  message: 'Session ready. Sleep Drive is monitoring.',
  audio_healthy: true,
  cooldown_remaining_s: 0,
  interventions_triggered: 0,
  questions_asked: 0,
  recent_log: [],
  simulated: false,
}

const INITIAL_MANAGER_STATE: ManagerState = {
  phase: 'idle',
  conversationState: 'IDLE',
  question: '',
  transcript: '',
  elapsed: 0,
  listening: false,
  micBlocked: false,
  musicConsent: 'idle',
  cooldownRemaining: 0,
  questionSource: 'scripted',
  lastLatency: null,
  language: 'auto',
  history: [],
  aiAvailable: null,
  speaking: false,
  lastIntent: '',
  lastAction: null,
}

export function useFatigue(onGoEmergency?: () => void) {
  const [mode, setMode] = useState<SleepMode>('live')
  const [driver, setDriver] = useState<DriverState>(EMPTY_DRIVER)
  const [listening, setListening] = useState(false)
  const [micBlocked, setMicBlocked] = useState(false)
  const [thresholds, setThresholds] = useState<FatigueThresholds>(() => {
    try {
      const saved = localStorage.getItem('roadsafe.thresholds')
      if (saved) return { ...DEFAULT_THRESHOLDS, ...JSON.parse(saved) }
    } catch {
      /* noop */
    }
    return DEFAULT_THRESHOLDS
  })
  const [ttsEnabled, setTtsEnabled] = useState(true)
  const [aiEnabled, setAiEnabled] = useState(() => {
    try {
      return localStorage.getItem('roadsafe.ai') !== 'off'
    } catch {
      return true
    }
  })
  const [managerState, setManagerState] = useState<ManagerState>(INITIAL_MANAGER_STATE)

  // ------------------------------------------------------------------ refs
  const activeRef = useRef(false)
  const sessionIdRef = useRef('')
  const sessionStartRef = useRef<number | null>(null)
  const thresholdsRef = useRef(thresholds)
  const transportRef = useRef<AudioTransport | null>(null)
  const localEngineRef = useRef<EngineState>(createEngineState())
  const driverRef = useRef<DriverState>(EMPTY_DRIVER)
  const roadContextRef = useRef<RoadContext | null>(null)
  const managerRef = useRef<ConversationManager | null>(null)
  const modeRef = useRef<'live' | 'demo'>('live')
  const onEmergencyRef = useRef(onGoEmergency)
  onEmergencyRef.current = onGoEmergency

  const micSupported = useMemo(
    () => typeof window !== 'undefined' && 'webkitSpeechRecognition' in window,
    [],
  )

  // ------------------------------------------------------------ emit event
  const emitEvent = useCallback(
    async (ev: {
      event_type: FatigueEventType
      latency_ms?: number | null
      response_duration_ms?: number | null
      speech_confidence?: number | null
      speech_rate_wpm?: number | null
      transcript?: string | null
      prompt_id?: string | null
      error_code?: string | null
      language?: string | null
      intent?: string | null
      simulated?: boolean
    }): Promise<DriverState> => {
      // Always advance the local engine as a continuously-synced shadow: it
      // powers scripted prompt selection and offline fallback.
      localEngineRef.current = applyEvent(localEngineRef.current, ev, thresholdsRef.current)
      const sid = sessionIdRef.current
      if (sid) {
        try {
          return await api.fatigueEvent({ session_id: sid, ...ev })
        } catch {
          /* backend unavailable — use the local shadow */
        }
      }
      return toDriverState(
        localEngineRef.current,
        sid || 'local',
        modeRef.current,
        null,
      )
    },
    [],
  )

  // --------------------------------------------------------------- manager
  // The manager is created once; its deps read through refs so the instance
  // survives re-renders without stale closures.
  if (!managerRef.current) {
    managerRef.current = new ConversationManager({
      emitEvent,
      thresholds: () => thresholdsRef.current,
      getDriver: () => driverRef.current,
      applyDriver: (d) => {
        driverRef.current = d
        setDriver(d)
      },
      scriptedNextPrompt: () => nextPrompt(localEngineRef.current),
      mode: () => modeRef.current,
      setMode: (m) => {
        modeRef.current = m
      },
      sessionId: () => sessionIdRef.current,
      setSessionId: (id) => {
        sessionIdRef.current = id
      },
      sessionStart: () => sessionStartRef.current,
      setSessionStart: (t) => {
        sessionStartRef.current = t
      },
      isActive: () => activeRef.current,
      setActive: (a) => {
        activeRef.current = a
      },
      transport: () => transportRef.current,
      onState: (s) => setManagerState(s),
      roadContext: () => roadContextRef.current,
      onEmergency: () => onEmergencyRef.current?.(),
    })
  }
  const manager = managerRef.current

  // ------------------------------------------------------------- transport
  useEffect(() => {
    const t = createAudioTransport('browser')
    transportRef.current = t
    const offStatus = t.onStatus((s) => {
      setListening(s.listening)
      setMicBlocked(s.micBlocked)
    })
    const offSpeech = t.onSpeech((e) => {
      manager.onSpeechEvent({
        kind: e.kind,
        finalText: e.finalText,
        interimText: e.interimText,
        confidence: e.confidence,
        error: e.error,
      })
      if (e.kind === 'error' && e.error) {
        const kind = classifyRecognitionError(e.error)
        if (kind && activeRef.current) {
          emitEvent({ event_type: kind, error_code: e.error }).catch(() => {})
        }
      }
    })
    return () => {
      offStatus()
      offSpeech()
      t.stop()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ------------------------------------------------------- public surface
  const start = useCallback(
    (m?: SleepMode) => {
      const useMode = m ?? modeRef.current
      modeRef.current = useMode
      setMode(useMode)
      manager.start(useMode)
    },
    [manager],
  )

  const stop = useCallback(() => {
    activeRef.current = false
    manager.stop()
    setDriver(EMPTY_DRIVER)
    setListening(false)
    setManagerState(INITIAL_MANAGER_STATE)
  }, [manager])

  const pause = useCallback(() => manager.pause(), [manager])
  const resume = useCallback(() => manager.resume(), [manager])
  const recover = useCallback(() => manager.recover(), [manager])
  const offerMusic = useCallback(() => manager.offerMusic(), [manager])
  const stopMusic = useCallback(() => manager.stopMusic(), [manager])
  const demoReply = useCallback((text?: string) => manager.demoReply(text), [manager])
  const simulateDelayedReply = useCallback(
    (text: string, delayMs: number) => manager.simulateDelayedReply(text, delayMs),
    [manager],
  )
  const forceTimeout = useCallback(() => manager.forceTimeout(), [manager])
  const pushToTalk = useCallback(() => manager.pushToTalk(), [manager])
  const setTts = useCallback(
    (on: boolean) => {
      manager.setTts(on)
      setTtsEnabled(on)
      if (!on) transportRef.current?.stopSpeaking()
    },
    [manager],
  )
  const setAi = useCallback(
    (on: boolean) => {
      manager.setAi(on)
      setAiEnabled(on)
    },
    [manager],
  )
  const setMusicVolume = useCallback((v: number) => manager.setMusicVolume(v), [manager])
  const setLanguage = useCallback((code: string) => {
    manager.setLanguage(code)
    transportRef.current?.setLanguage(code)
  }, [manager])
  const setRoadContext = useCallback((ctx: RoadContext | null) => {
    roadContextRef.current = ctx
  }, [])
  const sessionSeconds = useCallback(() => manager.sessionSeconds(), [manager])

  const updateThresholds = useCallback(
    (t: FatigueThresholds) => {
      thresholdsRef.current = t
      setThresholds(t)
      try {
        localStorage.setItem('roadsafe.thresholds', JSON.stringify(t))
      } catch {
        /* noop */
      }
    },
    [],
  )

  const changeMode = useCallback(
    (m: SleepMode) => {
      modeRef.current = m
      setMode(m)
    },
    [],
  )

  const cooldownRemaining = useMemo(
    () => managerState.cooldownRemaining,
    [managerState.cooldownRemaining],
  )

  return {
    // UI phase (kept compatible with the earlier hook API)
    phase: managerState.phase,
    mode,
    setMode: changeMode,
    driver,
    question: managerState.question,
    elapsed: managerState.elapsed,
    listening,
    micBlocked,
    transcript: managerState.transcript,
    lastLatency: managerState.lastLatency,
    thresholds,
    micSupported,
    maxWait: thresholds.max_wait_seconds,
    ttsEnabled,
    aiEnabled,
    aiAvailable: managerState.aiAvailable,
    questionSource: managerState.questionSource,
    cooldownRemaining,
    musicConsent: managerState.musicConsent,
    isActive: activeRef.current,
    // NEW — bidirectional / multilingual surface
    language: managerState.language,
    setLanguage,
    conversationState: managerState.conversationState,
    history: managerState.history,
    speaking: managerState.speaking,
    lastIntent: managerState.lastIntent,
    lastAction: managerState.lastAction,
    setRoadContext,
    pushToTalk,
    // controls
    start,
    stop,
    pause,
    resume,
    recover,
    offerMusic,
    stopMusic,
    demoReply,
    simulateDelayedReply,
    forceTimeout,
    updateThresholds,
    setTts,
    setMusicVolume,
    setAi,
    sessionSeconds,
  }
}

export type UseFatigue = ReturnType<typeof useFatigue>
