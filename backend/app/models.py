"""Pydantic models for the RoadSafe AI API.

Coordinate convention: geometry is a list of [lat, lon] pairs.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal, Optional

from pydantic import BaseModel, Field


def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


# --------------------------------------------------------------------------
# Hazards
# --------------------------------------------------------------------------

HazardType = Literal[
    "pothole",
    "poor_lighting",
    "accident",
    "road_blockage",
    "construction",
    "flooding",
    "dangerous_intersection",
]

HazardSeverity = Literal["low", "medium", "high"]

HAZARD_LABELS: dict[str, str] = {
    "pothole": "Pothole",
    "poor_lighting": "Poor lighting",
    "accident": "Accident",
    "road_blockage": "Road blockage",
    "construction": "Construction",
    "flooding": "Flooding",
    "dangerous_intersection": "Dangerous intersection",
}

SEVERITY_WEIGHT = {"low": 0.4, "medium": 0.7, "high": 1.0}


class HazardIn(BaseModel):
    type: HazardType
    severity: HazardSeverity = "medium"
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)
    description: str = ""


class Hazard(HazardIn):
    id: str
    source: Literal["demo", "user"] = "user"
    reported_at: str = Field(default_factory=utcnow)
    distance_m: Optional[float] = None  # set when attached to a segment


# --------------------------------------------------------------------------
# Route & safety scores
# --------------------------------------------------------------------------


class FactorExplanation(BaseModel):
    factor: str
    score: float
    impact: float  # positive = drags score down
    detail: str


class Segment(BaseModel):
    id: int
    name: str
    geometry: list[list[float]]  # [lat, lon] pairs
    start: list[float]
    end: list[float]
    distance_km: float
    safety_score: float
    risk_level: str
    risk_color: str
    factors: dict[str, float]
    explanation: list[FactorExplanation]
    recommendation: str
    hazards: list[Hazard] = Field(default_factory=list)


class RouteResponse(BaseModel):
    source: Literal["live", "demo"]
    provider: str
    start: list[float]
    end: list[float]
    distance_km: float
    duration_min: float
    geometry: list[list[float]]
    segments: list[Segment]
    overall_score: float
    overall_risk: str
    overall_color: str
    hazards: list[Hazard] = Field(default_factory=list)
    weather: Optional[dict] = None  # current conditions at route midpoint
    computed_at: str = Field(default_factory=utcnow)


class SafetyScoreRequest(BaseModel):
    geometry: list[list[float]]
    name: Optional[str] = None


# --------------------------------------------------------------------------
# Risk Fusion
# --------------------------------------------------------------------------

class RiskFusionRequest(BaseModel):
    """
    Input required to combine road risk and driver risk.

    safety_score comes from the currently active road segment.
    session_id identifies the active Sleep Drive session.
    """

    safety_score: float = Field(ge=0, le=100)
    session_id: str


class RiskComponent(BaseModel):
    """A normalized risk component where higher = more dangerous."""

    score: float
    level: str


class RiskIntervention(BaseModel):
    """Action recommended by the contextual risk engine."""

    required: bool
    type: str
    message: str


class RiskFusionResponse(BaseModel):
    """Combined road + driver + contextual risk."""

    road_risk: RiskComponent
    driver_risk: RiskComponent
    contextual_risk: RiskComponent
    intervention: RiskIntervention


# --------------------------------------------------------------------------
# Hospitals & emergency
# --------------------------------------------------------------------------


class Hospital(BaseModel):
    id: str
    name: str
    address: str = ""
    lat: float
    lon: float
    distance_km: float
    # None when no valid driving route exists — never a fabricated value.
    eta_min: Optional[float] = None
    phone: str = ""
    source: Literal["live", "demo"] = "live"
    eta_source: Literal["live", "estimated", "unavailable"] = "unavailable"


class EmergencyRouteStep(BaseModel):
    instruction: str
    distance_m: int
    name: str = ""


class EmergencyRouteResponse(BaseModel):
    source: Literal["live", "demo"]
    provider: str
    start: list[float]
    end: list[float]
    distance_km: float
    duration_min: float
    geometry: list[list[float]]  # [lat, lon] pairs
    steps: list[EmergencyRouteStep] = Field(default_factory=list)
    hospital_id: str = ""
    computed_at: str = Field(default_factory=utcnow)


class EmergencyActivateRequest(BaseModel):
    lat: float
    lon: float
    radius_km: Optional[float] = None


class EmergencyResponse(BaseModel):
    emergency_number: str
    region: str
    message: str
    map_link: str
    countdown_seconds: int
    hospitals: list[Hospital]
    search_radius_km: float
    hospitals_source: str = "overpass"  # OpenStreetMap / Overpass
    activated_at: str = Field(default_factory=utcnow)


# --------------------------------------------------------------------------
# Fatigue / Sleep Drive
# --------------------------------------------------------------------------

# Conversational state (what the orchestrator is doing right now). The
# Conversation Manager owns turn-taking / barge-in / permissions / language,
# so the vocabulary is richer than the engine's check-in loop. The fatigue
# engine only ever emits the classic set; the manager drives the rest.
ConversationStateName = Literal[
    "IDLE",
    "CHECK_IN",
    "WAITING_FOR_RESPONSE",
    "ANALYZING",
    "INTERVENTION",
    "QUIET_MONITORING",
    "LISTENING",
    "PROCESSING",
    "AI_SPEAKING",
    "WAITING_FOR_USER",
    "MUSIC_PERMISSION",
    "SAFETY_CHECK",
    "ESCALATION",
    "ERROR",
]

# Driver risk state (the temporal estimate of reduced engagement)
DriverRiskState = Literal["NORMAL", "ATTENTION", "ELEVATED", "HIGH_CONCERN"]

# The backend consumes a stream of conversation/audio events and derives the
# driver-state estimate. Keeping this as an explicit event taxonomy makes the
# system auditable and lets other Routiq services subscribe without
# understanding the internal fatigue algorithm.
FatigueEventType = Literal[
    "session_started",
    "prompt_issued",
    "speech_started",
    "speech_ended",
    "response_received",
    "driver_initiated",
    "intent_detected",
    "language_detected",
    "language_changed",
    "ai_response_generated",
    "tts_started",
    "tts_finished",
    "tts_interrupted",
    "silence_timeout",
    "music_permission_requested",
    "music_permission_granted",
    "music_permission_denied",
    "music_started",
    "music_stopped",
    "microphone_error",
    "audio_failure",
    "asr_error",
    "intervention_triggered",
    "state_changed",
    "reset",
]


class FatigueSessionCreate(BaseModel):
    driver_name: str = ""
    mode: Literal["live", "demo"] = "live"
    thresholds: Optional[dict] = None
    language: str = "en-IN"


class FatigueEvent(BaseModel):
    session_id: str
    event_type: FatigueEventType
    # Timing metadata (milliseconds) — the raw material of the state engine.
    latency_ms: Optional[float] = None          # speech_start - prompt timestamp
    speech_started_at_ms: Optional[float] = None
    speech_ended_at_ms: Optional[float] = None
    response_duration_ms: Optional[float] = None  # seconds of speech / text proxy
    # Speech signals (supporting evidence ONLY — never sufficient alone)
    speech_confidence: Optional[float] = None   # 0..1 ASR confidence
    speech_rate_wpm: Optional[float] = None
    disfluency: Optional[float] = None          # 0..1 heuristic
    transcript: Optional[str] = None
    prompt_id: Optional[str] = None
    error_code: Optional[str] = None            # for microphone/asr failures
    # Conversational metadata (bidirectional + multilingual)
    language: Optional[str] = None              # BCP-47, e.g. "hi-IN"
    intent: Optional[str] = None                # e.g. "SAFETY_QUERY"
    simulated: bool = False


class InteractionRecord(BaseModel):
    """One completed conversational turn, with timing metadata.

    Raw timestamps are stored for auditability but the UI consumes the
    derived signals (latency_ms, response_present, band) instead.
    """

    prompt_id: str
    latency_ms: Optional[float] = None
    response_present: bool = True
    response_length: Optional[int] = None
    band: str = "NORMAL"
    timestamp: str = Field(default_factory=utcnow)


class LogEntry(BaseModel):
    timestamp: str = Field(default_factory=utcnow)
    event_type: str
    summary: str


class FatigueSession(BaseModel):
    session_id: str
    driver_name: str = ""
    mode: Literal["live", "demo"] = "live"
    thresholds: dict = Field(default_factory=dict)

    # --- conversational state (orchestrator) -----------------------------
    conversation_state: ConversationStateName = "IDLE"
    last_question: str = ""
    questions_asked: int = 0
    last_prompt_at: Optional[str] = None
    next_prompt_allowed_at: Optional[str] = None
    # bidirectional + multilingual
    language: str = "en-IN"                     # active conversation language
    driver_initiated_count: int = 0             # times the driver spoke first
    last_intent: str = ""                       # most recent detected intent

    # --- driver risk state (temporal engine) -----------------------------
    state: DriverRiskState = "NORMAL"
    fatigue_risk: float = 0.0       # 0..1 temporal estimate
    engagement: float = 1.0         # 0..1 (inverse of risk, for the UI)
    confidence: float = 0.0         # 0..1 how much the estimate is trusted
    state_reason: str = ""          # why the state last changed (observability)
    evidence: list[str] = Field(default_factory=list)

    # --- raw counters (kept for the UI / debugging) -----------------------
    slow_responses: int = 0
    missed_responses: int = 0
    interventions_triggered: int = 0
    recent_delayed_responses: int = 0
    silence_detected: bool = False
    response_latency_ms: Optional[float] = None

    # --- personal baseline ------------------------------------------------
    baseline_latency_ms: Optional[float] = None
    baseline_samples: int = 0

    # --- audio health -----------------------------------------------------
    audio_healthy: bool = True
    last_mic_error: Optional[str] = None

    # --- audit trail ------------------------------------------------------
    interactions: list[InteractionRecord] = Field(default_factory=list)
    events: list[LogEntry] = Field(default_factory=list)

    started_at: str = Field(default_factory=utcnow)
    message: str = "Session ready. Sleep Drive is monitoring."


class DriverState(BaseModel):
    """Clean current-state representation for Dashboard / Risk Fusion.

    Consumers (dashboard, road-safety fusion service) read ONLY this — they
    never need to understand the internal fatigue algorithm. Risk and
    confidence are deliberately kept separate: HIGH risk with LOW confidence
    is a real state (few samples, poor mic), not a contradiction.
    """

    session_id: str
    mode: Literal["live", "demo"] = "live"
    state: DriverRiskState
    fatigue_risk: float
    engagement: float
    confidence: float
    response_latency_ms: Optional[float] = None
    silence_detected: bool
    recent_delayed_responses: int
    slow_responses: int = 0
    missed_responses: int = 0
    baseline_latency_ms: Optional[float] = None
    baseline_samples: int = 0
    last_interaction_at: Optional[str] = None
    evidence: list[str]
    conversation_state: ConversationStateName
    last_question: str
    language: str = "en-IN"
    last_intent: str = ""
    driver_initiated_count: int = 0
    message: str
    audio_healthy: bool
    cooldown_remaining_s: float = 0.0
    interventions_triggered: int = 0
    questions_asked: int = 0
    recent_log: list[LogEntry] = Field(default_factory=list)
    simulated: bool = False


# Compatibility alias — the client used to call this FatigueState
FatigueState = DriverState


# --------------------------------------------------------------------------
# Config
# --------------------------------------------------------------------------


class FatigueChatRequest(BaseModel):
    """Bidirectional conversational turn.

    The driver may speak first (driver_text), or the orchestrator may be
    issuing a proactive prompt (intent="question") or reacting to a reply
    (intent="reply"). The backend attaches driver-state + road context so
    the LLM answers contextually but can never touch the fatigue engine.
    """

    session_id: str = ""
    # question | reply | freeform | driver_initiated
    intent: str = "freeform"
    messages: list[dict] = Field(default_factory=list)  # [{"role", "content"}]
    driver_text: str = ""  # what the driver just said (may be empty)
    language: str = "en-IN"
    road_context: Optional[dict] = None  # overall_risk / score / reasons


class FatigueChatResponse(BaseModel):
    reply: str
    source: Literal["groq", "ai", "scripted"]
    intent: str = "GENERAL_CONVERSATION"  # classified intent
    language: str = "en-IN"
    # Optional deterministic action proposal. The LLM proposes; the app
    # decides. Never executed directly by the backend.
    action: Optional[dict] = None  # {"type": "music_request" | ...}


class TTSRequest(BaseModel):
    text: str
    language: str = "en-IN"


class TTSResponse(BaseModel):
    audio_base64: Optional[str] = None
    format: str = "wav"
    source: Literal["sarvam", "elevenlabs", "browser", "none"] = "none"
    provider: str = "sarvam"
    cached: bool = False
    fallback: bool = False
    fallback_reason: Optional[str] = None
    message: str = ""


class TranscribeRequest(BaseModel):
    language_hint: str = "auto"  # "auto" lets Saaras v3 detect
    mode: str = "transcribe"


class TranscribeResponse(BaseModel):
    transcript: Optional[str] = None
    language_code: Optional[str] = None
    source: Literal["sarvam", "browser", "error"] = "error"
    provider: str = "browser"
    fallback: bool = True
    fallback_reason: Optional[str] = None
    error: str = ""


class ConfigResponse(BaseModel):
    safety_weights: dict[str, float]
    fatigue_thresholds: dict
    risk_levels: dict[str, dict]
    segment_target_meters: float
    max_segments: int
    hazard_radius_m: float
    emergency_countdown_seconds: int
    providers: dict[str, str]  # e.g. {"routing": "osrm", "hospitals": "demo"}
    api_keys_configured: list[str]
