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
# Hospitals & emergency
# --------------------------------------------------------------------------


class Hospital(BaseModel):
    id: str
    name: str
    address: str = ""
    lat: float
    lon: float
    distance_km: float
    eta_min: float
    phone: str = ""
    source: Literal["live", "demo"] = "demo"
    eta_source: Literal["live", "estimated"] = "estimated"


class EmergencyActivateRequest(BaseModel):
    lat: float
    lon: float


class EmergencyResponse(BaseModel):
    emergency_number: str
    region: str
    message: str
    map_link: str
    countdown_seconds: int
    hospitals: list[Hospital]
    activated_at: str = Field(default_factory=utcnow)


# --------------------------------------------------------------------------
# Fatigue / Sleep Drive
# --------------------------------------------------------------------------

FatigueStateName = Literal[
    "IDLE", "NORMAL", "QUESTION", "WAITING_FOR_RESPONSE",
    "ANALYZE_RESPONSE", "CAUTION", "ESCALATE",
]


class FatigueSessionCreate(BaseModel):
    driver_name: str = ""
    thresholds: Optional[dict] = None


class FatigueSession(BaseModel):
    session_id: str
    driver_name: str = ""
    thresholds: dict = Field(default_factory=dict)
    state: FatigueStateName = "NORMAL"
    escalation_level: int = 0  # 0..3
    fatigue_confidence: float = 0.0
    slow_responses: int = 0
    missed_responses: int = 0
    questions_asked: int = 0
    started_at: str = Field(default_factory=utcnow)
    last_question: str = ""
    message: str = "Session ready. Sleep Drive is monitoring."


class FatigueEvent(BaseModel):
    session_id: str
    event_type: Literal[
        "question_asked", "response", "no_response", "timeout", "state_ack", "reset"
    ]
    latency_seconds: Optional[float] = None
    response_duration: Optional[float] = None  # seconds of speech / text length proxy
    transcript: Optional[str] = None
    simulated: bool = False


class FatigueState(BaseModel):
    session_id: str
    state: FatigueStateName
    escalation_level: int
    fatigue_confidence: float
    slow_responses: int
    missed_responses: int
    questions_asked: int
    last_question: str
    message: str
    latency_band: Optional[str] = None


# --------------------------------------------------------------------------
# Config
# --------------------------------------------------------------------------


class FatigueChatRequest(BaseModel):
    session_id: str = ""
    intent: Literal["question", "reply", "freeform"] = "question"
    messages: list[dict] = Field(default_factory=list)  # [{"role", "content"}]


class FatigueChatResponse(BaseModel):
    reply: str
    source: Literal["ai", "scripted"]


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
