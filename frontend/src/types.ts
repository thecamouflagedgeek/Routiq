export type LatLng = [number, number]

export type RiskLevel = 'SAFE' | 'MODERATE' | 'HIGH' | 'CRITICAL'

export type HazardType =
  | 'pothole'
  | 'poor_lighting'
  | 'accident'
  | 'road_blockage'
  | 'construction'
  | 'flooding'
  | 'dangerous_intersection'

export type HazardSeverity = 'low' | 'medium' | 'high'

export interface Hazard {
  id: string
  type: HazardType
  severity: HazardSeverity
  lat: number
  lon: number
  description: string
  source: 'demo' | 'user'
  reported_at: string
  distance_m?: number | null
}

export interface FactorExplanation {
  factor: string
  score: number
  impact: number
  detail: string
}

export interface Segment {
  id: number
  name: string
  geometry: LatLng[]
  start: LatLng
  end: LatLng
  distance_km: number
  safety_score: number
  risk_level: RiskLevel
  risk_color: string
  factors: Record<string, number>
  explanation: FactorExplanation[]
  recommendation: string
  hazards: Hazard[]
}

export interface RouteResponse {
  source: 'live' | 'demo'
  provider: string
  start: LatLng
  end: LatLng
  distance_km: number
  duration_min: number
  geometry: LatLng[]
  segments: Segment[]
  overall_score: number
  overall_risk: RiskLevel
  overall_color: string
  hazards: Hazard[]
  weather?: {
    main: string
    description: string
    temp_c: number
    is_night: boolean
    source: 'live' | 'demo'
  } | null
  computed_at: string
}

export interface Hospital {
  id: string
  name: string
  address: string
  lat: number
  lon: number
  distance_km: number
  eta_min: number
  phone: string
  source: 'live' | 'demo'
  eta_source: 'live' | 'estimated'
}

export interface EmergencyResponse {
  emergency_number: string
  region: string
  message: string
  map_link: string
  countdown_seconds: number
  hospitals: Hospital[]
  activated_at: string
}

// --------------------------------------------------------------------------
// Sleep Drive — conversational driver-engagement model
// --------------------------------------------------------------------------

// What the conversational orchestrator is doing right now. The Conversation
// Manager owns turn-taking / barge-in / permissions / language, so the
// vocabulary is richer than the engine's check-in loop.
export type ConversationStateName =
  | 'IDLE'
  | 'CHECK_IN'
  | 'WAITING_FOR_RESPONSE'
  | 'ANALYZING'
  | 'INTERVENTION'
  | 'QUIET_MONITORING'
  | 'LISTENING'
  | 'PROCESSING'
  | 'AI_SPEAKING'
  | 'WAITING_FOR_USER'
  | 'MUSIC_PERMISSION'
  | 'SAFETY_CHECK'
  | 'ESCALATION'
  | 'ERROR'

// Temporal driver-state estimate. Deliberately NOT a binary awake/asleep:
// NORMAL -> ATTENTION -> ELEVATED -> HIGH_CONCERN.
export type DriverRiskState = 'NORMAL' | 'ATTENTION' | 'ELEVATED' | 'HIGH_CONCERN'

export type FatigueEventType =
  | 'session_started'
  | 'prompt_issued'
  | 'speech_started'
  | 'speech_ended'
  | 'response_received'
  | 'driver_initiated'
  | 'intent_detected'
  | 'language_detected'
  | 'language_changed'
  | 'ai_response_generated'
  | 'tts_started'
  | 'tts_finished'
  | 'tts_interrupted'
  | 'silence_timeout'
  | 'music_permission_requested'
  | 'music_permission_granted'
  | 'music_permission_denied'
  | 'music_started'
  | 'music_stopped'
  | 'microphone_error'
  | 'audio_failure'
  | 'asr_error'
  | 'intervention_triggered'
  | 'state_changed'
  | 'reset'

export interface LogEntry {
  timestamp: string
  event_type: string
  summary: string
}

/**
 * Clean current-state representation for the Dashboard / Risk Fusion.
 * Risk and confidence are deliberately separate: HIGH risk with LOW
 * confidence (few samples, poor mic) is a real state, not a contradiction.
 */
export interface DriverState {
  session_id: string
  mode: 'live' | 'demo'
  state: DriverRiskState
  fatigue_risk: number
  engagement: number
  confidence: number
  response_latency_ms: number | null
  silence_detected: boolean
  recent_delayed_responses: number
  slow_responses: number
  missed_responses: number
  baseline_latency_ms: number | null
  baseline_samples: number
  last_interaction_at: string | null
  evidence: string[]
  conversation_state: ConversationStateName
  last_question: string
  language: string
  last_intent: string
  driver_initiated_count: number
  message: string
  audio_healthy: boolean
  cooldown_remaining_s: number
  interventions_triggered: number
  questions_asked: number
  recent_log: LogEntry[]
  simulated: boolean
}

// Backwards-compatible alias — the UI previously called this FatigueState.
export type FatigueState = DriverState

export interface FatigueThresholds {
  // absolute latency floors (seconds)
  normal_max: number
  mild_max: number
  elevated_max: number
  max_wait_seconds: number
  min_response_duration: number
  // personal baseline
  baseline_window: number
  min_baseline_samples: number
  min_baseline_seconds: number
  baseline_max_score: number
  // relative deviation vs. baseline
  slow_ratio: number
  severe_ratio: number
  // temporal aggregation / hysteresis
  risk_decay_seconds: number
  risk_attention: number
  risk_elevated: number
  risk_high: number
  // conversational pacing — how long until the NEXT proactive prompt.
  // Healthy drivers get long, slightly randomized quiet periods; the interval
  // shortens as risk rises (risk-adaptive prompting).
  healthy_min_prompt_interval: number
  healthy_max_prompt_interval: number
  attention_prompt_interval: number
  elevated_prompt_interval: number
  critical_prompt_interval: number
}

// --------------------------------------------------------------------------
// Bidirectional conversation — chat / TTS / STT contracts
// --------------------------------------------------------------------------

/** Driver-initiated intents (backend merges Groq semantic + deterministic
 *  safety rules; safety-critical always win). */
export type DriverIntent =
  | 'EMERGENCY'
  | 'FATIGUE_DISCLOSURE'
  | 'SAFETY_QUERY'
  | 'ROUTE_REQUEST'
  | 'MUSIC_REQUEST'
  | 'LANGUAGE_SWITCH'
  | 'GENERAL_CONVERSATION'
  | 'PROACTIVE_CHECKIN'
  | 'RESPONSE'
  | 'UNKNOWN'

/** Road context attached to chat turns so the LLM can answer contextually
 *  without touching the safety engine. */
export interface RoadContext {
  overall_risk?: string
  overall_score?: number
  reasons?: string[]
  distance_km?: number
  duration_min?: number
}

export interface FatigueChatRequest {
  intent: 'question' | 'reply' | 'freeform' | 'driver_initiated'
  session_id?: string
  messages: { role: string; content: string }[]
  driver_text?: string
  language?: string
  road_context?: RoadContext | null
}

export interface FatigueChatResponse {
  reply: string
  source: 'groq' | 'ai' | 'scripted'
  intent: string
  language: string
  action?: { type: string } | null
}

export interface TTSResponse {
  audio_base64: string | null
  format: string
  source: 'sarvam' | 'elevenlabs' | 'browser' | 'none'
  provider: string
  cached: boolean
  fallback: boolean
  fallback_reason?: string | null
  message: string
}

export interface TranscribeResponse {
  transcript: string | null
  language_code: string | null
  source: 'sarvam' | 'browser' | 'error'
  provider: string
  fallback: boolean
  fallback_reason?: string | null
  error: string
}

export interface GeocodeResult {
  name: string
  latitude: number
  longitude: number
  formattedAddress: string
}

export interface Place {
  label: string
  sublabel: string
  lat: number
  lon: number
  city: string
  name?: string
  formattedAddress?: string
}

