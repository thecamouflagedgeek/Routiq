/**
 * Local mirror of the backend Sleep Drive state engine (app/services/fatigue.py).
 *
 * The backend owns the state machine when it is reachable (auditable event
 * stream). This pure-TypeScript port exists so Sleep Drive stays fully
 * functional offline / when the API is down. The two implementations share
 * one spec — any tuning must be applied to both.
 */
import type {
  ConversationStateName,
  DriverRiskState,
  DriverState,
  FatigueEventType,
  FatigueThresholds,
  LogEntry,
} from '../../types'

export interface EngineEventInput {
  event_type: FatigueEventType
  latency_ms?: number | null
  response_duration_ms?: number | null
  speech_confidence?: number | null
  transcript?: string | null
  prompt_id?: string | null
  error_code?: string | null
  simulated?: boolean
}

export interface InteractionRecord {
  prompt_id: string
  latency_ms: number | null
  response_present: boolean
  response_length: number | null
  band: string
  timestamp: string
}

export interface EngineState {
  state: DriverRiskState
  conversation_state: ConversationStateName
  fatigue_risk: number
  engagement: number
  confidence: number
  slow_responses: number
  missed_responses: number
  recent_delayed_responses: number
  silence_detected: boolean
  response_latency_ms: number | null
  baseline_latency_ms: number | null
  baseline_samples: number
  evidence: string[]
  state_reason: string
  audio_healthy: boolean
  last_mic_error: string | null
  interventions_triggered: number
  questions_asked: number
  last_question: string
  message: string
  interactions: InteractionRecord[]
  events: LogEntry[]
  // internal (not exposed) — personal baseline window + streaks
  baselineSamples: number[]
  adverseStreak: number
  goodStreak: number
  lastEventAtMs: number
}

const BAND_INDEX: Record<DriverRiskState, number> = {
  NORMAL: 0,
  ATTENTION: 1,
  ELEVATED: 2,
  HIGH_CONCERN: 3,
}
const BANDS: DriverRiskState[] = ['NORMAL', 'ATTENTION', 'ELEVATED', 'HIGH_CONCERN']

const QUESTION_POOL = [
  "How's the drive going?",
  'Quick check — what was the last turn you took?',
  'Want me to play something for you?',
  'What road are we on right now?',
  'How are you feeling — need a break soon?',
]

const CHECKIN_VARIANTS: Record<string, string[]> = {
  ATTENTION: [
    'Hey, you doing okay? Just checking in.',
    'You seem a little quiet — everything alright up there?',
  ],
  ELEVATED: [
    "You've been a little quiet. Hey, are you still with me?",
    'A couple of those replies were slow. Want me to help you find a place to stop?',
  ],
  HIGH_CONCERN: [
    "Your responses have slowed significantly. If you're feeling tired, please consider stopping somewhere safe for a break.",
  ],
}

export const CRITICAL_MESSAGE =
  'Possible fatigue or reduced engagement detected. Please pull over at the next safe location as soon as it is safe to do so.'

const clamp = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v))

function isoNow(): string {
  return new Date().toISOString()
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

export function createEngineState(): EngineState {
  return {
    state: 'NORMAL',
    conversation_state: 'CHECK_IN',
    fatigue_risk: 0.06, // fresh estimate: slightly conservative
    engagement: 0.94,
    confidence: 0,
    slow_responses: 0,
    missed_responses: 0,
    recent_delayed_responses: 0,
    silence_detected: false,
    response_latency_ms: null,
    baseline_latency_ms: null,
    baseline_samples: 0,
    evidence: [],
    state_reason: '',
    audio_healthy: true,
    last_mic_error: null,
    interventions_triggered: 0,
    questions_asked: 0,
    last_question: '',
    message: 'Session ready. Sleep Drive is monitoring.',
    interactions: [],
    events: [{ timestamp: isoNow(), event_type: 'session_started', summary: 'Session started — monitoring.' }],
    baselineSamples: [],
    adverseStreak: 0,
    goodStreak: 0,
    lastEventAtMs: Date.now(),
  }
}

function baselineTrusted(s: EngineState, t: FatigueThresholds): boolean {
  return s.baselineSamples.length >= t.min_baseline_samples
}

function baselineMedian(s: EngineState): number | null {
  if (!s.baselineSamples.length) return null
  return median(s.baselineSamples)
}

function ratioOf(s: EngineState, t: FatigueThresholds, latencyMs: number): number | null {
  const med = baselineMedian(s)
  if (med == null) return null
  return latencyMs / Math.max(med, t.min_baseline_seconds * 1000)
}

function scoreResponse(
  s: EngineState,
  t: FatigueThresholds,
  latencyMs: number | null,
): { score: number; band: string; extra: string[] } {
  if (latencyMs == null) return { score: 0, band: 'NORMAL', extra: [] }
  const secs = latencyMs / 1000
  const extra: string[] = []
  let score: number
  let band: string

  if (secs > t.elevated_max) {
    score = 0.85
    band = 'SEVERE'
    extra.push(`response latency ${secs.toFixed(1)}s exceeds safe window`)
  } else if (secs > t.mild_max) {
    score = 0.7
    band = 'ELEVATED'
    extra.push(`response latency ${secs.toFixed(1)}s well above normal`)
  } else if (secs > t.normal_max) {
    score = 0.5
    band = 'MILD'
    extra.push(`response latency ${secs.toFixed(1)}s noticeably slower`)
  } else if (baselineTrusted(s, t)) {
    const ratio = ratioOf(s, t, latencyMs)
    if (ratio != null && ratio >= t.severe_ratio) {
      score = 0.85
      band = 'SEVERE'
      extra.push(`response ${ratio.toFixed(1)}× slower than personal baseline`)
    } else if (ratio != null && ratio >= t.slow_ratio) {
      score = 0.6
      band = 'ELEVATED'
      extra.push(`response ${ratio.toFixed(1)}× slower than personal baseline`)
    } else {
      score = 0
      band = 'NORMAL'
    }
  } else {
    score = 0
    band = 'NORMAL'
  }
  return { score, band, extra }
}

function applySignal(s: EngineState, t: FatigueThresholds, score: number, nowMs: number) {
  const dt = Math.max(0, nowMs - s.lastEventAtMs) / 1000
  let prev = s.fatigue_risk * Math.exp(-dt / t.risk_decay_seconds)
  const adverse = score >= 0.35
  const k = score >= 0.8 ? 0.8 : adverse ? 0.3 : 0.4
  prev = prev + k * (score - prev)
  s.fatigue_risk = Number(clamp(prev, 0.05, 1).toFixed(3))
  s.engagement = Number(clamp(1 - s.fatigue_risk, 0, 1).toFixed(3))
  if (adverse) {
    s.adverseStreak += 1
    s.goodStreak = 0
  } else {
    s.goodStreak += 1
    s.adverseStreak = 0
  }
  s.lastEventAtMs = nowMs
}

function recompute(
  s: EngineState,
  t: FatigueThresholds,
  fromSilence: boolean,
  priorRisk: number | null,
  extraEvidence: string[] = [],
) {
  const prev = s.state
  const risk = s.fatigue_risk
  let newState: DriverRiskState

  if (fromSilence) {
    const strongSilence =
      baselineTrusted(s, t) || (priorRisk != null && priorRisk >= 0.3) || s.missed_responses >= 2
    newState = strongSilence && risk >= 0.55 ? 'HIGH_CONCERN' : 'ELEVATED'
  } else if (risk >= t.risk_high) {
    newState = 'HIGH_CONCERN'
  } else if (risk >= t.risk_elevated) {
    newState = 'ELEVATED'
  } else if (risk >= t.risk_attention) {
    newState = 'ATTENTION'
  } else {
    newState = 'NORMAL'
  }

  // conservative: without a trusted baseline, timing alone caps at ATTENTION
  if (!baselineTrusted(s, t) && !fromSilence && BAND_INDEX[newState] > BAND_INDEX.ATTENTION) {
    newState = 'ATTENTION'
  }
  // hysteresis: never drop more than one level per interaction
  if (BAND_INDEX[newState] < BAND_INDEX[prev] - 1) {
    newState = BANDS[BAND_INDEX[prev] - 1]
  }

  // recent delayed responses within the baseline window
  let recent = 0
  for (const rec of s.interactions.slice(-t.baseline_window)) {
    if (rec.band !== 'NORMAL' || !rec.response_present) recent += 1
  }
  s.recent_delayed_responses = recent

  const evidence: string[] = []
  if (fromSilence && s.audio_healthy) evidence.push('prolonged silence — no response detected')
  if (s.response_latency_ms != null && baselineTrusted(s, t)) {
    const ratio = ratioOf(s, t, s.response_latency_ms)
    if (ratio != null && ratio >= t.slow_ratio) {
      evidence.push(`response ${ratio.toFixed(1)}× slower than personal baseline`)
    }
  }
  if (recent >= 2) evidence.push('repeated delayed responses')
  if (!baselineTrusted(s, t)) evidence.push('insufficient baseline data — estimates are conservative')
  if (!s.audio_healthy) evidence.push('microphone unavailable — risk not increased')
  if (s.confidence < 0.4) evidence.push('low confidence in estimate')
  if (newState === 'NORMAL' && s.fatigue_risk <= 0.12) evidence.push('responses consistent with personal baseline')
  if (BAND_INDEX[newState] < BAND_INDEX[prev]) evidence.push('engagement improving — continuing to monitor')
  for (const e of extraEvidence) if (!evidence.includes(e)) evidence.push(e)
  s.evidence = evidence.slice(0, 5)

  s.state = newState
  if (newState === 'HIGH_CONCERN') s.conversation_state = 'INTERVENTION'
  s.confidence = Number(clamp(0.25 + 0.12 * Math.min(s.baseline_samples, 5) * (s.audio_healthy ? 1 : 0.5), 0.05, 0.95).toFixed(2))

  s.state_reason = prev === newState
    ? 'risk estimate updated (smoothed)'
    : fromSilence
      ? 'unexplained prolonged non-response (healthy microphone)'
      : BAND_INDEX[newState] > BAND_INDEX[prev]
        ? `temporal risk rose to ${risk.toFixed(2)} with ${s.baseline_samples} baseline sample(s)`
        : `repeated good responses — risk fell to ${risk.toFixed(2)}`

  if (newState !== prev) {
    log(s, 'state_changed', `State: ${prev} → ${newState} | Reason: ${s.state_reason}`)
    if (BAND_INDEX[newState] >= BAND_INDEX.ELEVATED) {
      s.interventions_triggered += 1
      const note = newState === 'HIGH_CONCERN' ? 'stop recommendation issued' : 'considerate check-in scheduled'
      log(s, 'intervention_triggered', `Escalation to ${newState} — ${note}.`)
    }
  }
}

function log(s: EngineState, event_type: string, summary: string) {
  s.events.push({ timestamp: isoNow(), event_type, summary })
  if (s.events.length > 200) s.events = s.events.slice(-200)
}

/** Apply one event to the engine state (pure — returns a new object). */
export function applyEvent(
  state: EngineState,
  event: EngineEventInput,
  thresholds: FatigueThresholds,
  nowMs = Date.now(),
): EngineState {
  const s: EngineState = JSON.parse(JSON.stringify(state))
  const t = thresholds
  switch (event.event_type) {
    case 'prompt_issued':
      s.conversation_state = 'WAITING_FOR_RESPONSE'
      s.questions_asked += 1
      s.last_question = event.transcript || "How's the drive going?"
      log(s, 'prompt_issued', `Prompt issued: "${s.last_question}"`)
      break
    case 'speech_started':
      log(s, 'speech_started', 'Speech detected — measuring response.')
      break
    case 'response_received': {
      if (!s.audio_healthy) {
        s.audio_healthy = true
        s.last_mic_error = null
        log(s, 'state_changed', 'Audio path healthy again — response received.')
      }
      const { score, band, extra } = scoreResponse(s, t, event.latency_ms ?? null)
      if (event.latency_ms != null) {
        if (score <= t.baseline_max_score) s.baselineSamples.push(event.latency_ms)
        if (s.baselineSamples.length > t.baseline_window) s.baselineSamples.shift()
        s.baseline_latency_ms = baselineMedian(s)
        s.baseline_samples = s.baselineSamples.length
        s.response_latency_ms = event.latency_ms
        s.silence_detected = false
      }
      s.conversation_state = 'ANALYZING'
      s.interactions.push({
        prompt_id: event.prompt_id || Math.random().toString(36).slice(2, 10),
        latency_ms: event.latency_ms ?? null,
        response_present: true,
        response_length: event.transcript ? event.transcript.length : null,
        band,
        timestamp: isoNow(),
      })
      if (s.interactions.length > 20) s.interactions = s.interactions.slice(-20)
      applySignal(s, t, score, nowMs)
      s.slow_responses = score >= 0.35 ? s.slow_responses + 1 : Math.max(0, s.slow_responses - 1)
      s.message = bandMessage(band, score)
      recompute(s, t, false, null, extra)
      log(
        s,
        'response_received',
        `Response received — latency ${event.latency_ms != null ? (event.latency_ms / 1000).toFixed(1) : 'n/a'}s, band ${band}, score ${score.toFixed(2)}`,
      )
      break
    }
    case 'silence_timeout': {
      s.conversation_state = 'ANALYZING'
      s.silence_detected = true
      s.missed_responses += 1
      if (!s.audio_healthy) {
        s.message =
          'No response detected — but the microphone is unavailable, so this does not count toward fatigue.'
        log(s, 'silence_timeout', 'Silence detected with an unhealthy microphone — risk NOT increased.')
        recompute(s, t, false, null)
        break
      }
      const priorRisk = s.fatigue_risk
      applySignal(s, t, 1.0, nowMs)
      recompute(s, t, true, priorRisk)
      s.message =
        "No response detected. If you're feeling tired, consider pulling over somewhere safe for a break."
      log(s, 'silence_timeout', 'No response within the wait window (healthy microphone) — genuine non-response.')
      break
    }
    case 'microphone_error':
    case 'audio_failure':
    case 'asr_error': {
      s.audio_healthy = false
      s.last_mic_error = event.error_code || event.event_type
      s.confidence = Number(clamp(s.confidence * 0.5, 0.05, 0.95).toFixed(2))
      const label =
        event.event_type === 'microphone_error'
          ? 'Microphone unavailable'
          : event.event_type === 'audio_failure'
            ? 'Audio stream failure'
            : 'Speech recognition failure'
      s.message = `${label} — this does not affect your fatigue estimate. No response will be counted while the mic is unavailable.`
      if (!s.evidence.some((e) => e.includes(label))) {
        s.evidence = [label + ' — risk not increased', ...s.evidence].slice(0, 5)
      }
      log(s, event.event_type, `${label} — risk NOT increased, confidence lowered.`)
      break
    }
    case 'intervention_triggered':
      s.interventions_triggered += 1
      s.conversation_state = 'INTERVENTION'
      if (event.transcript) s.message = event.transcript
      break
    case 'reset': {
      s.state = 'NORMAL'
      s.conversation_state = 'CHECK_IN'
      s.fatigue_risk = 0.06
      s.engagement = 0.94
      s.slow_responses = 0
      s.missed_responses = 0
      s.recent_delayed_responses = 0
      s.silence_detected = false
      s.response_latency_ms = null
      s.evidence = ['Session reset — monitoring resumed.']
      s.state_reason = 'Manual reset (driver confirmed awake).'
      s.message = 'Sleep Drive reset. Monitoring resumed.'
      s.adverseStreak = 0
      s.goodStreak = 0
      log(s, 'reset', 'Session reset — baseline retained.')
      break
    }
    default:
      break
  }
  return s
}

function bandMessage(band: string, score: number): string {
  if (score >= 0.8) return 'Response was substantially slower than your normal pattern. Stay with me.'
  if (band === 'ELEVATED') return "Response was noticeably delayed. I want to make sure you're okay."
  if (band === 'MILD') return 'Slightly slower response than usual — checking in.'
  return 'Response looks good — continuing to monitor.'
}

/** Pick the next conversational prompt for the current state. */
export function nextPrompt(s: EngineState): string {
  const level = s.state
  if (level in CHECKIN_VARIANTS) {
    const variants = CHECKIN_VARIANTS[level]
    const idx = s.questions_asked % variants.length
    let candidate = variants[idx]
    if (candidate === s.last_question && variants.length > 1) {
      candidate = variants[(idx + 1) % variants.length]
    }
    return candidate
  }
  return QUESTION_POOL[s.questions_asked % QUESTION_POOL.length]
}

/**
 * Risk-adaptive prompt pacing. Returns how long the assistant should stay
 * quiet before the NEXT proactive prompt for the given driver state.
 * Healthy drivers get a long, slightly randomized quiet period; intervals
 * shorten as the estimate worsens. This is the PROMPT INTERVAL — it is never
 * conflated with response latency (prompt-to-response time).
 */
export function promptIntervalFor(state: DriverRiskState, t: FatigueThresholds): number {
  if (state === 'HIGH_CONCERN') return t.critical_prompt_interval
  if (state === 'ELEVATED') return t.elevated_prompt_interval
  if (state === 'ATTENTION') return t.attention_prompt_interval
  const lo = Math.max(10, t.healthy_min_prompt_interval)
  const hi = Math.max(lo, t.healthy_max_prompt_interval)
  return lo + Math.random() * (hi - lo)
}

// Backwards-compatible alias — the client previously called this per state.
export function cooldownForState(state: DriverRiskState, t: FatigueThresholds): number {
  return promptIntervalFor(state, t)
}

/** Convert engine internals to the public DriverState shape. */
export function toDriverState(
  s: EngineState,
  sessionId: string,
  mode: 'live' | 'demo',
  cooldownUntilMs: number | null,
): DriverState {
  const cooldown = cooldownUntilMs != null ? Math.max(0, (cooldownUntilMs - Date.now()) / 1000) : 0
  return {
    session_id: sessionId,
    mode,
    state: s.state,
    fatigue_risk: s.fatigue_risk,
    engagement: s.engagement,
    confidence: s.confidence,
    response_latency_ms: s.response_latency_ms,
    silence_detected: s.silence_detected,
    recent_delayed_responses: s.recent_delayed_responses,
    slow_responses: s.slow_responses,
    missed_responses: s.missed_responses,
    baseline_latency_ms: s.baseline_latency_ms,
    baseline_samples: s.baseline_samples,
    last_interaction_at: s.interactions.length ? s.interactions[s.interactions.length - 1].timestamp : null,
    evidence: s.evidence,
    conversation_state: s.conversation_state,
    last_question: s.last_question,
    language: 'auto',
    last_intent: '',
    driver_initiated_count: 0,
    message: s.message,
    audio_healthy: s.audio_healthy,
    cooldown_remaining_s: Number(cooldown.toFixed(1)),
    interventions_triggered: s.interventions_triggered,
    questions_asked: s.questions_asked,
    recent_log: s.events.slice(-8),
    simulated: false,
  }
}
