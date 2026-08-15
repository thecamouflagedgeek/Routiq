"""Central configuration for the RoadSafe AI backend.

Every tunable knob (safety weights, fatigue thresholds, API keys, radii)
lives here so nothing is hard-coded across the codebase. Values can be
overridden with environment variables. Optional API keys are empty by
default — the app must still start and function with demo providers.
"""
from __future__ import annotations

import os
from dataclasses import asdict, dataclass, field
from pathlib import Path

try:
    from dotenv import load_dotenv

    load_dotenv(Path(__file__).resolve().parent.parent / ".env")
except ImportError:
    pass


def _env_float(name: str, default: float) -> float:
    raw = os.environ.get(name)
    if raw is None or raw == "":
        return default
    try:
        return float(raw)
    except ValueError:
        return default


def _env_int(name: str, default: int) -> int:
    raw = os.environ.get(name)
    if raw is None or raw == "":
        return default
    try:
        return int(raw)
    except ValueError:
        return default


@dataclass
class SafetyWeights:
    """Weight of each factor in the 0-100 segment safety score. Sums to 1.0."""

    hazards: float = 0.30
    lighting: float = 0.20
    accidents: float = 0.25
    road_quality: float = 0.15
    traffic: float = 0.10

    def as_dict(self) -> dict[str, float]:
        return asdict(self)

    def validate(self) -> None:
        total = sum(self.as_dict().values())
        if abs(total - 1.0) > 0.001:
            raise ValueError(f"Safety weights must sum to 1.0, got {total}")


@dataclass
class FatigueThresholds:
    """Response-latency thresholds (seconds) used by the fatigue engine.

    0..normal_max          -> normal
    normal_max..mild_max   -> mild concern
    mild_max..elevated_max -> elevated concern
    > elevated_max         -> severe concern
    """

    normal_max: float = 2.0
    mild_max: float = 4.0
    elevated_max: float = 7.0
    max_wait_seconds: float = 20.0
    min_response_duration: float = 1.2  # responses shorter than this are "unusually short"
    slow_before_caution: int = 1        # slow responses before escalation level 1
    slow_before_elevated: int = 2       # slow responses before escalation level 2
    missed_before_critical: int = 2     # consecutive missed responses before level 3

    def as_dict(self) -> dict:
        return asdict(self)

    def latency_band(self, latency: float) -> str:
        if latency <= self.normal_max:
            return "NORMAL"
        if latency <= self.mild_max:
            return "MILD"
        if latency <= self.elevated_max:
            return "ELEVATED"
        return "SEVERE"


@dataclass
class Settings:
    # --- Providers / API keys (all optional) -------------------------------
    routing_api_key: str = os.environ.get("ROUTING_API_KEY", "")
    map_api_key: str = os.environ.get("MAP_API_KEY", "")
    ai_api_key: str = os.environ.get("AI_API_KEY", "")
    traffic_api_key: str = os.environ.get("TRAFFIC_API_KEY", "")
    weather_api_key: str = os.environ.get("WEATHER_API_KEY", "")
    mappls_api_key: str = os.environ.get("MAPPLS_API_KEY", "")

    osrm_url: str = os.environ.get("OSRM_URL", "https://router.project-osrm.org")
    osrm_timeout: float = _env_float("OSRM_TIMEOUT", 3.0)

    # TomTom (routing + traffic share one key)
    tomtom_url: str = "https://api.tomtom.com"
    tomtom_timeout: float = _env_float("TOMTOM_TIMEOUT", 4.0)

    # OpenWeather
    openweather_url: str = "https://api.openweathermap.org/data/2.5/weather"

    # Gemini
    gemini_model: str = os.environ.get("GEMINI_MODEL", "gemini-2.0-flash")
    gemini_timeout: float = _env_float("GEMINI_TIMEOUT", 5.0)

    @property
    def has_routing(self) -> bool:
        return bool(self.routing_api_key)

    @property
    def has_traffic(self) -> bool:
        return bool(self.traffic_api_key or self.routing_api_key)

    @property
    def has_weather(self) -> bool:
        return bool(self.weather_api_key)

    @property
    def has_ai(self) -> bool:
        return bool(self.ai_api_key)

    # --- Safety engine -------------------------------------------------------
    safety_weights: SafetyWeights = field(default_factory=SafetyWeights)
    segment_target_meters: float = _env_float("SEGMENT_TARGET_METERS", 750.0)
    max_segments: int = _env_int("MAX_SEGMENTS", 10)
    min_segments: int = _env_int("MIN_SEGMENTS", 4)
    hazard_radius_m: float = _env_float("HAZARD_RADIUS_METERS", 700.0)

    # --- Fatigue engine ------------------------------------------------------
    fatigue_thresholds: FatigueThresholds = field(default_factory=FatigueThresholds)

    # --- Emergency -----------------------------------------------------------
    emergency_countdown_seconds: int = _env_int("EMERGENCY_COUNTDOWN_SECONDS", 60)
    hospital_limit: int = _env_int("HOSPITAL_LIMIT", 6)

    # --- Storage -------------------------------------------------------------
    data_dir: str = os.environ.get("ROADSAFE_DATA_DIR", os.path.join(os.path.dirname(__file__), "data"))

    def __post_init__(self) -> None:
        self.safety_weights.validate()


settings = Settings()

RISK_LEVELS = {
    "SAFE": {"min": 80, "color": "#22c55e", "label": "Safe"},
    "MODERATE": {"min": 60, "color": "#facc15", "label": "Moderate risk"},
    "HIGH": {"min": 45, "color": "#f97316", "label": "High risk"},
    "CRITICAL": {"min": 0, "color": "#ef4444", "label": "Critical risk"},
}

RISK_ORDER = ["SAFE", "MODERATE", "HIGH", "CRITICAL"]


def risk_level_for(score: float) -> str:
    for level in RISK_ORDER:
        if score >= RISK_LEVELS[level]["min"]:
            return level
    return "CRITICAL"


def risk_color_for(score: float) -> str:
    return RISK_LEVELS[risk_level_for(score)]["color"]


RECOMMENDATIONS = {
    "SAFE": "No special precautions needed. Drive on.",
    "MODERATE": "Stay alert and maintain a safe following distance.",
    "HIGH": "Use caution, reduce speed, and watch for hazards ahead.",
    "CRITICAL": "Slow down significantly and consider an alternative, safer route.",
}
