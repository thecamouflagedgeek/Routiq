import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DEFAULT_THRESHOLDS, latencyBand } from '../config'
import { api } from '../services/api'
import {
  DemoMusic,
  createRecognition,
  hasSpeechRecognition,
  initVoices,
  playAlertSound,
  speak,
  stopSpeaking,
} from '../services/speech'
import type { FatigueState, FatigueThresholds } from '../types'

export type SleepPhase =
  | 'idle'
  | 'starting'
  | 'intro'
  | 'waiting'
  | 'listening'
  | 'analyzing'
  | 'paused'
  | 'alert'

const QUESTION_POOL = [
  "How's the drive going?",
  'Quick check — what was the last turn you took?',
  'Want me to play something for you?',
  'What road are we on right now?',
  'How are you feeling — need a break soon?',
]

const CHECKIN_VARIANTS: Record<number, string[]> = {
  1: [
    'You seem a little quiet — everything okay?',
    'Just checking in — how are you holding up?',
    'All good up there? Let me know.',
  ],
  2: [
    "Hey, you still with me? A couple of those replies were slow.",
    "I want to make sure you're doing okay — talk to me.",
    "You've gone quiet a couple times now. Everything alright?",
  ],
  3: ['I need you to pull over now. Are you able to stop safely?'],
}

const INTRO = 'Sleep Drive is active. I will check in with you as we drive. First question — '
const CRITICAL_SPEECH =
  'Possible fatigue detected. Please pull over at the next safe location as soon as it is safe to do so.'

const EMPTY_STATE: FatigueState = {
  session_id: '',
  state: 'NORMAL',
  escalation_level: 0,
  fatigue_confidence: 0,
  slow_responses: 0,
  missed_responses: 0,
  questions_asked: 0,
  last_question: '',
  message: '',
}

export interface LatencyResult {
  latency: number
  band: 'NORMAL' | 'MILD' | 'ELEVATED' | 'SEVERE'
  color: string
  label: string
  transcript: string
}

export interface DriverState {
  engagement: number
  fatigueRisk: 'LOW' | 'ELEVATED' | 'HIGH' | 'CRITICAL'
  responseLatency: number | null
  silenceDetected: boolean
  state: FatigueState['state']
  active: boolean
}

function localStep(
  prev: FatigueState,
  type: 'question_asked' | 'response' | 'no_response' | 'timeout' | 'reset',
  latency?: number,
  duration?: number,
  transcript?: string,
  thresholds = DEFAULT_THRESHOLDS,
): FatigueState {
  const next = { ...prev }
  if (type === 'question_asked') {
    next.state = 'QUESTION'
    next.questions_asked += 1
    next.last_question = transcript || "How's the drive going?"
    next.message = 'Question asked — listening for a response.'
    return next
  }
  if (type === 'reset') {
    return { ...EMPTY_STATE, session_id: prev.session_id, state: 'NORMAL', message: 'Sleep Drive reset. Monitoring resumed.' }
  }
  if (type === 'response') {
    const band =
      latency === undefined
        ? 'NORMAL'
        : latency <= thresholds.normal_max
          ? 'NORMAL'
          : latency <= thresholds.mild_max
            ? 'MILD'
            : latency <= thresholds.elevated_max
              ? 'ELEVATED'
              : 'SEVERE'
    next.state = 'ANALYZE_RESPONSE'
    next.missed_responses = Math.max(0, next.missed_responses - 1)
    const short = duration !== undefined && duration < thresholds.min_response_duration && band !== 'NORMAL'
    if (band !== 'NORMAL' || short) next.slow_responses += 1
    else next.slow_responses = Math.max(0, next.slow_responses - 1)
  } else {
    next.state = 'WAITING_FOR_RESPONSE'
    next.missed_responses += 1
  }
  const severity = next.slow_responses + 2 * next.missed_responses
  next.escalation_level = severity === 0 ? 0 : severity <= 2 ? 1 : severity <= 4 ? 2 : 3
  next.fatigue_confidence = Math.min(
    96,
    next.slow_responses * 14 + next.missed_responses * 22 + (next.escalation_level === 3 ? 20 : 0),
  )
  next.state = next.escalation_level >= 2 ? 'ESCALATE' : next.escalation_level >= 1 ? 'CAUTION' : 'NORMAL'
  const bandKey = next.escalation_level === 0 ? 'NORMAL' : next.escalation_level === 1 ? 'MILD' : next.escalation_level === 2 ? 'ELEVATED' : 'SEVERE'
  const messageMap: Record<string, string> = {
    NORMAL: 'Response looks good — continuing to monitor.',
    MILD: 'Slightly delayed response. Checking in with you.',
    ELEVATED: 'Response was noticeably delayed. Stay with me.',
    SEVERE: 'Possible fatigue detected. Please consider a break.',
  }
  next.message =
    type === 'response'
      ? messageMap[bandKey]
      : next.escalation_level >= 3
        ? CRITICAL_SPEECH
        : next.escalation_level === 2
          ? "Hey, you still with me? I'm getting worried."
          : 'No response detected. Checking in again shortly.'
  return next
}

function musicVolumeFor(level: number): number {
  if (level >= 3) return 0.3
  if (level >= 2) return 0.18
  return 0.05
}

export function useFatigue() {
  const [phase, setPhase] = useState<SleepPhase>('idle')
  const [state, setState] = useState<FatigueState>(EMPTY_STATE)
  const [question, setQuestion] = useState('')
  const [elapsed, setElapsed] = useState(0)
  const [listening, setListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [lastLatency, setLastLatency] = useState<LatencyResult | null>(null)
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
  const [aiAvailable, setAiAvailable] = useState<boolean | null>(null)
  const [questionSource, setQuestionSource] = useState<'ai' | 'scripted'>('scripted')

  const phaseRef = useRef<SleepPhase>('idle')
  const stateRef = useRef<FatigueState>(EMPTY_STATE)
  const sessionIdRef = useRef('')
  const sessionStartRef = useRef<number | null>(null)
  const questionStartRef = useRef(0)
  const speechStartRef = useRef<number | null>(null)
  const thresholdsRef = useRef(thresholds)
  const musicRef = useRef<DemoMusic | null>(null)
  const recognitionRef = useRef<ReturnType<typeof createRecognition> | null>(null)
  const timersRef = useRef<number[]>([])
  const activeRef = useRef(false)
  const ttsRef = useRef(true)
  const aiRef = useRef(true)
  const aiAvailableRef = useRef<boolean | null>(null)
  const historyRef = useRef<{ role: string; content: string }[]>([])

  const micSupported = useMemo(() => hasSpeechRecognition(), [])

  const setPhaseBoth = useCallback((p: SleepPhase) => {
    phaseRef.current = p
    setPhase(p)
  }, [])

  const applyState = useCallback((s: FatigueState) => {
    stateRef.current = s
    setState(s)
    musicRef.current?.setVolume(musicVolumeFor(s.escalation_level))
  }, [])

  const later = useCallback((fn: () => void, ms: number) => {
    const id = window.setTimeout(fn, ms)
    timersRef.current.push(id)
  }, [])

  const clearTimers = useCallback(() => {
    timersRef.current.forEach((id) => window.clearTimeout(id))
    timersRef.current = []
  }, [])

  // ------------------------------------------------------------------ voice
  const stopListening = useCallback(() => {
    recognitionRef.current?.stop()
    setListening(false)
  }, [])

  const startListening = useCallback(() => {
    if (!recognitionRef.current?.isSupported) return
    setListening(true)
    recognitionRef.current.start()
  }, [])

  const restartRecognition = useCallback(() => {
    if (!activeRef.current || phaseRef.current !== 'waiting') {
      setListening(false)
      return
    }
    setListening(true)
    window.requestAnimationFrame(() => {
      if (!activeRef.current || phaseRef.current !== 'waiting') {
        setListening(false)
        return
      }
      try {
        recognitionRef.current?.start()
      } catch {
        setListening(false)
      }
    })
  }, [])

  const ensureRecognition = useCallback(() => {
    if (recognitionRef.current) return
    recognitionRef.current = createRecognition({
      onStart: () => setListening(true),
      onEnd: () => {
        if (phaseRef.current === 'waiting' && activeRef.current) {
          restartRecognition()
        } else {
          setListening(false)
        }
      },
      onSpeechStart: () => {
        speechStartRef.current = performance.now()
      },
      onResult: (finalText, interim) => {
        if (interim) setTranscript(interim)
        if (finalText && finalText.trim()) {
          const at = performance.now()
          const started = speechStartRef.current ?? at
          respond((started - questionStartRef.current) / 1000, finalText.trim())
        }
      },
      onError: (err) => {
        if (err === 'not-allowed' || err === 'service-not-allowed') {
          setListening(false)
          setTranscript('(microphone blocked — use the demo controls below)')
        }
      },
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const sessionSeconds = useCallback((): number | undefined => {
    if (sessionStartRef.current == null) return undefined
    return (performance.now() - sessionStartRef.current) / 1000
  }, [])

  const pickQuestion = useCallback(
    async (): Promise<{ text: string; source: 'ai' | 'scripted' }> => {
      const scripted = nextQuestion(stateRef.current, stateRef.current.questions_asked)
      if (aiRef.current && aiAvailableRef.current) {
        const ai = await Promise.race([
          api
            .fatigueChat({
              intent: 'question',
              session_id: sessionIdRef.current || undefined,
              messages: historyRef.current.slice(-12),
            })
            .then((r) => (r.source === 'ai' ? r.reply : null)),
          new Promise<string | null>((res) => setTimeout(() => res(null), 1500)),
        ])
        if (ai) return { text: ai, source: 'ai' }
      }
      return { text: scripted, source: 'scripted' }
    },
    [],
  )

  // -------------------------------------------------------------------- ask
  // Mic now starts almost immediately (small delay just to let the UI paint
  // and avoid catching the very start of the TTS attack). It no longer waits
  // for TTS onEnd — that was the main source of felt lag between turns.
  const askQuestion = useCallback(async () => {
    if (!activeRef.current) return
    const { text: q, source } = await pickQuestion()
    setQuestionSource(source)
    setQuestion(q)
    setTranscript('')
    setLastLatency(null)
    setElapsed(0)
    questionStartRef.current = performance.now()
    speechStartRef.current = null
    setPhaseBoth('waiting')

    const sid = sessionIdRef.current
    if (sid) {
      api
        .fatigueEvent({ session_id: sid, event_type: 'question_asked', transcript: q })
        .then(applyState)
        .catch(() => {})
    } else {
      applyState(localStep(stateRef.current, 'question_asked', undefined, undefined, q))
    }

    historyRef.current = [...historyRef.current.slice(-9), { role: 'assistant', content: q }]

    later(() => startListening(), 250)
    if (ttsRef.current) speak(q, { rate: 1.02 })
  }, [applyState, later, pickQuestion, setPhaseBoth, startListening])

  // ------------------------------------------------------------------ alert
  const enterAlert = useCallback(() => {
    if (!activeRef.current) return
    stopListening()
    clearTimers()
    setPhaseBoth('alert')
    playAlertSound()
    if (ttsRef.current) speak(CRITICAL_SPEECH)
  }, [clearTimers, setPhaseBoth, stopListening])

  // ----------------------------------------------------------------- respond
  const respond = useCallback(
    (latency: number, text?: string) => {
      if (!activeRef.current || phaseRef.current === 'analyzing') return
      stopListening()
      clearTimers()
      const safeLatency = Math.max(0.1, Math.round(latency * 10) / 10)
      const band = latencyBand(safeLatency, thresholdsRef.current)
      setLastLatency({
        latency: safeLatency,
        band: band.band,
        color: band.color,
        label: band.label,
        transcript: text || '(no audio transcript)',
      })
      setPhaseBoth('analyzing')
      speechStartRef.current = null

      if (text) {
        historyRef.current = [...historyRef.current.slice(-9), { role: 'user', content: text }]
      }
      const duration = text ? Math.min(8, text.split(' ').length * 0.5 + 1) : undefined
      const sid = sessionIdRef.current
      const prevLevel = stateRef.current.escalation_level

      const apply = (s: FatigueState) => {
        applyState(s)
        const staysNormal = prevLevel === 0 && s.escalation_level === 0

        if (text && aiRef.current && aiAvailableRef.current) {
          Promise.race([
            api
              .fatigueChat({
                intent: 'reply',
                session_id: sessionIdRef.current || undefined,
                messages: historyRef.current.slice(-12),
              })
              .then((r) => (r.source === 'ai' ? r.reply : null)),
            new Promise<string | null>((res) => setTimeout(() => res(null), 1500)),
          ]).then((ai) => {
            const spoken = ai || s.message
            if (ttsRef.current && !(staysNormal && !ai)) speak(spoken)
          })
        } else if (ttsRef.current && !staysNormal) {
          speak(s.message || 'Response analyzed.')
        }

        // shortened pacing — turns feel snappier
        if (s.escalation_level >= 3) later(() => enterAlert(), 1000)
        else later(() => askQuestion(), staysNormal ? 400 : 900)
      }

      if (sid) {
        api
          .fatigueEvent({
            session_id: sid,
            event_type: 'response',
            latency_seconds: safeLatency,
            response_duration: duration,
            transcript: text,
            simulated: !text,
          })
          .then(apply)
          .catch(() => apply(localStep(stateRef.current, 'response', safeLatency, duration, text)))
      } else {
        apply(localStep(stateRef.current, 'response', safeLatency, duration, text))
      }
    },
    [applyState, askQuestion, clearTimers, enterAlert, later, setPhaseBoth, stopListening],
  )

  // ---------------------------------------------------------------- timeout
  const handleTimeout = useCallback(() => {
    if (!activeRef.current || phaseRef.current === 'analyzing') return
    stopListening()
    clearTimers()
    setPhaseBoth('analyzing')
    setLastLatency({
      latency: thresholdsRef.current.max_wait_seconds,
      band: 'SEVERE',
      color: '#ef4444',
      label: 'No response',
      transcript: '(no speech detected)',
    })

    const sid = sessionIdRef.current
    const apply = (s: FatigueState) => {
      applyState(s)
      if (ttsRef.current) speak(s.message)
      if (s.escalation_level >= 3) later(() => enterAlert(), 1000)
      else later(() => askQuestion(), 1200)
    }
    if (sid) {
      api
        .fatigueEvent({ session_id: sid, event_type: 'timeout', simulated: true })
        .then(apply)
        .catch(() => apply(localStep(stateRef.current, 'timeout')))
    } else {
      apply(localStep(stateRef.current, 'timeout'))
    }
  }, [applyState, askQuestion, clearTimers, enterAlert, later, setPhaseBoth, stopListening])

  // ------------------------------------------------------------- public API
  const start = useCallback(() => {
    if (activeRef.current) return
    activeRef.current = true
    sessionStartRef.current = performance.now()
    initVoices()
    ensureRecognition()
    musicRef.current = musicRef.current || new DemoMusic()
    musicRef.current.setVolume(0.05)
    musicRef.current.start()
    setPhaseBoth('starting')

    if (aiRef.current && aiAvailableRef.current === null) {
      api
        .fatigueChat({ intent: 'question', messages: [] })
        .then((r) => {
          aiAvailableRef.current = r.source === 'ai'
          setAiAvailable(aiAvailableRef.current)
        })
        .catch(() => {
          aiAvailableRef.current = false
          setAiAvailable(false)
        })
    }

    api
      .createFatigueSession({
        normal_max: thresholdsRef.current.normal_max,
        mild_max: thresholdsRef.current.mild_max,
        elevated_max: thresholdsRef.current.elevated_max,
        max_wait_seconds: thresholdsRef.current.max_wait_seconds,
        min_response_duration: thresholdsRef.current.min_response_duration,
      })
      .then((s) => {
        sessionIdRef.current = s.session_id
        applyState(s)
      })
      .catch(() => {
        sessionIdRef.current = ''
        applyState({ ...EMPTY_STATE, state: 'NORMAL', message: 'Sleep Drive running (local mode)' })
      })
      .finally(() => {
        setQuestion(INTRO)
        later(() => {
          if (!activeRef.current) return
          if (ttsRef.current) speak(INTRO)
          later(() => askQuestion(), 500)
        }, 500)
      })
  }, [applyState, askQuestion, ensureRecognition, later, setPhaseBoth])

  const stop = useCallback(() => {
    activeRef.current = false
    stopListening()
    clearTimers()
    stopSpeaking()
    musicRef.current?.stop()
    setPhaseBoth('idle')
    setListening(false)
    setState(EMPTY_STATE)
    setQuestion('')
    setLastLatency(null)
    sessionIdRef.current = ''
    sessionStartRef.current = null
  }, [clearTimers, setPhaseBoth, stopListening])

  const pause = useCallback(() => {
    activeRef.current = false
    stopListening()
    clearTimers()
    musicRef.current?.stop()
    setPhaseBoth('paused')
  }, [clearTimers, setPhaseBoth, stopListening])

  const resume = useCallback(() => {
    if (activeRef.current) return
    activeRef.current = true
    musicRef.current?.start()
    musicRef.current?.setVolume(musicVolumeFor(stateRef.current.escalation_level))
    setPhaseBoth('waiting')
    askQuestion()
  }, [askQuestion, setPhaseBoth])

  const recover = useCallback(() => {
    activeRef.current = true
    const sid = sessionIdRef.current
    if (sid) {
      api
        .fatigueEvent({ session_id: sid, event_type: 'reset' })
        .then(applyState)
        .catch(() => {})
    }
    applyState(localStep(stateRef.current, 'reset'))
    setLastLatency(null)
    later(() => askQuestion(), 1000)
  }, [applyState, askQuestion, later])

  const demoReply = useCallback(
    (text?: string) => {
      const latency = (performance.now() - questionStartRef.current) / 1000
      respond(latency, text)
    },
    [respond],
  )

  const simulateDelayedReply = useCallback(
    (text: string, delayMs: number) => {
      if (phaseRef.current !== 'waiting') return
      later(() => demoReply(text), delayMs)
    },
    [demoReply, later],
  )

  const forceTimeout = useCallback(() => {
    if (phaseRef.current === 'waiting') handleTimeout()
  }, [handleTimeout])

  const updateThresholds = useCallback((t: FatigueThresholds) => {
    thresholdsRef.current = t
    setThresholds(t)
    try {
      localStorage.setItem('roadsafe.thresholds', JSON.stringify(t))
    } catch {
      /* noop */
    }
  }, [])

  const setTts = useCallback((on: boolean) => {
    ttsRef.current = on
    setTtsEnabled(on)
    if (!on) stopSpeaking()
  }, [])

  const setMusicVolume = useCallback((v: number) => {
    musicRef.current?.setVolume(v)
  }, [])

  const setAi = useCallback((on: boolean) => {
    aiRef.current = on
    setAiEnabled(on)
    try {
      localStorage.setItem('roadsafe.ai', on ? 'on' : 'off')
    } catch {
      /* noop */
    }
  }, [setAiEnabled])

  useEffect(() => {
    if (phase !== 'waiting' && phase !== 'listening') return
    const id = window.setInterval(() => {
      const e = (performance.now() - questionStartRef.current) / 1000
      setElapsed(e)
      if (e >= thresholdsRef.current.max_wait_seconds) {
        window.clearInterval(id)
        handleTimeout()
      }
    }, 100)
    return () => window.clearInterval(id)
  }, [phase, handleTimeout])

  useEffect(
    () => () => {
      activeRef.current = false
      stopListening()
      clearTimers()
      stopSpeaking()
      musicRef.current?.stop()
    },
    [clearTimers, stopListening],
  )

  const driverState: DriverState = useMemo(() => {
    const fatigueRisk: DriverState['fatigueRisk'] =
      state.escalation_level === 0
        ? 'LOW'
        : state.escalation_level === 1
          ? 'ELEVATED'
          : state.escalation_level === 2
            ? 'HIGH'
            : 'CRITICAL'
    return {
      engagement: Math.max(0, Math.round(100 - state.fatigue_confidence)),
      fatigueRisk,
      responseLatency: lastLatency?.latency ?? null,
      silenceDetected: phase === 'alert' || state.missed_responses > 0,
      state: state.state,
      active: phase !== 'idle',
    }
  }, [state, lastLatency, phase])

  return {
    phase,
    state,
    question,
    elapsed,
    listening,
    transcript,
    lastLatency,
    thresholds,
    micSupported,
    maxWait: thresholds.max_wait_seconds,
    ttsEnabled,
    isActive: activeRef.current,
    start,
    stop,
    pause,
    resume,
    recover,
    demoReply,
    simulateDelayedReply,
    forceTimeout,
    askQuestion,
    updateThresholds,
    setTts,
    setMusicVolume,
    aiEnabled,
    aiAvailable,
    questionSource,
    setAi,
    driverState,
    sessionSeconds,
  }
}

function nextQuestion(state: FatigueState, asked: number): string {
  const level = state.escalation_level
  if (level === 0) {
    return QUESTION_POOL[asked % QUESTION_POOL.length]
  }
  const variants = CHECKIN_VARIANTS[level] ?? CHECKIN_VARIANTS[3]
  const idx = asked % variants.length
  let candidate = variants[idx]
  if (candidate === state.last_question && variants.length > 1) {
    candidate = variants[(idx + 1) % variants.length]
  }
  return candidate
}

export type UseFatigue = ReturnType<typeof useFatigue>