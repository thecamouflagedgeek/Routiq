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
    """Response-latency thresholds used by the Sleep Drive state engine.

    Two guards are applied to every response:

    1. ABSOLUTE floors (seconds) — nobody gets a pass just because their
       personal baseline is fast:
       0..normal_max          -> normal
       normal_max..mild_max   -> mild concern
       mild_max..elevated_max -> elevated concern
       > elevated_max         -> severe concern

    2. RELATIVE deviation vs. the driver's personal rolling baseline:
       deviation_ratio = latency / max(baseline, min_baseline_seconds)
       ratio > slow_ratio       -> noticeably slower than this driver's norm
       ratio > severe_ratio     -> substantially slower

    The strongest signal wins. Risk is never decided by a single response;
    the engine temporally aggregates and smooths before changing state.
    """

    normal_max: float = 2.0
    mild_max: float = 4.0
    elevated_max: float = 7.0
    max_wait_seconds: float = 20.0
    min_response_duration: float = 1.2  # responses shorter than this are "unusually short"

    # --- personal baseline ----------------------------------------------
    baseline_window: int = 6      # rolling window size (number of responses)
    min_baseline_samples: int = 3  # responses before baseline is trusted
    min_baseline_seconds: float = 1.0  # floor so a super-fast baseline is not abused

    # --- relative deviation ----------------------------------------------
    slow_ratio: float = 1.5      # latency >= 1.5x baseline => noticeably slower
    severe_ratio: float = 2.5    # latency >= 2.5x baseline => substantially slower

    # --- temporal aggregation / hysteresis --------------------------------
    risk_decay_seconds: float = 120.0  # risk decays back toward 0 over ~2 min
    adverse_streak_escalate: int = 2   # consecutive adverse signals before escalating
    good_streak_deescalate: int = 2    # consecutive good responses before improving
    # risk bands mapping to NORMAL / ATTENTION / ELEVATED / HIGH_CONCERN.
    # engagement shown in the UI is 1 - risk, so the arc for the demo is
    # ~95% (NORMAL) -> ~80% (ATTENTION) -> ~55-60% (ELEVATED) -> HIGH.
    risk_attention: float = 0.18
    risk_elevated: float = 0.32
    risk_high: float = 0.50

    # responses scoring above this are excluded from the personal baseline so
    # a degrading driver's "normal" does not drift upward with the slowdown
    baseline_max_score: float = 0.35

    # --- conversational orchestration -------------------------------------
    # Time until the next PROACTIVE prompt, by driver state. Healthy drivers
    # get long, quiet monitoring periods (the client randomizes within the
    # min/max range); intervals shorten as risk rises. These are SEPARATE from
    # response latency — a long gap between prompts never inflates the
    # prompt-to-response latency measurement.
    healthy_min_prompt_interval: float = 60.0
    healthy_max_prompt_interval: float = 120.0
    attention_prompt_interval: float = 35.0
    elevated_prompt_interval: float = 20.0
    critical_prompt_interval: float = 30.0

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

    osrm_url: str = os.environ.get("OSRM_URL", "https://router.project-osrm.org")
    osrm_timeout: float = _env_float("OSRM_TIMEOUT", 3.0)

    # Overpass (OpenStreetMap) hospital discovery — mirrors tried in order.
    # The public API rate-limits/queues, so we rotate through several mirrors
    # before giving up (and then surface a clear error, never fake data).
    overpass_urls: list[str] = field(default_factory=lambda: [
        os.environ.get("OVERPASS_URL", "https://overpass-api.de/api/interpreter"),
        os.environ.get("OVERPASS_FALLBACK_URL", "https://overpass.kumi.systems/api/interpreter"),
        os.environ.get("OVERPASS_MIRROR_URL", "https://overpass.private.coffee/api/interpreter"),
    ])
    overpass_timeout: float = _env_float("OVERPASS_TIMEOUT", 30.0)

    # TomTom (routing + traffic share one key)
    tomtom_url: str = "https://api.tomtom.com"
    tomtom_timeout: float = _env_float("TOMTOM_TIMEOUT", 4.0)

    # OpenWeather
    openweather_url: str = "https://api.openweathermap.org/data/2.5/weather"

    # Gemini (legacy fallback)
    gemini_model: str = os.environ.get("GEMINI_MODEL", "gemini-2.0-flash")
    gemini_timeout: float = _env_float("GEMINI_TIMEOUT", 5.0)

    # --- Groq (conversational reasoning + intent classification) ------------
    # Backend-only: never expose GROQ_API_KEY to the frontend or logs.
    groq_api_key: str = os.environ.get("GROQ_API_KEY", "")
    groq_chat_model: str = os.environ.get("GROQ_CHAT_MODEL", "llama-3.3-70b-versatile")
    groq_url: str = "https://api.groq.com/openai/v1/chat/completions"
    groq_timeout: float = _env_float("GROQ_TIMEOUT", 6.0)

    # --- Sarvam (speech-to-text + legacy fallback TTS) ----------------------
    # Backend-only: never expose SARVAM_API_KEY to the frontend or logs.
    sarvam_api_key: str = os.environ.get("SARVAM_API_KEY", "")
    sarvam_stt_model: str = os.environ.get("SARVAM_STT_MODEL", "saaras:v3")
    sarvam_tts_model: str = os.environ.get("SARVAM_TTS_MODEL", "bulbul:v3")
    sarvam_tts_voice: str = os.environ.get("SARVAM_TTS_VOICE", "shubh")
    sarvam_url: str = "https://api.sarvam.ai"
    sarvam_timeout: float = _env_float("SARVAM_TIMEOUT", 15.0)

    # --- ElevenLabs (preferred TTS provider) --------------------------------
    elevenlabs_api_key: str = os.environ.get("ELEVENLABS_API_KEY", "")
    elevenlabs_voice_id: str = os.environ.get("ELEVENLABS_VOICE_ID", "EXAVITQu4vr4xnSDxMaL")
    elevenlabs_model_id: str = os.environ.get("ELEVENLABS_MODEL_ID", "eleven_multilingual_v2")
    elevenlabs_agent_id: str = os.environ.get("ELEVENLABS_AGENT_ID", "")
    elevenlabs_url: str = "https://api.elevenlabs.io/v1"
    elevenlabs_timeout: float = _env_float("ELEVENLABS_TIMEOUT", 20.0)

    # --- LiveKit realtime voice session -------------------------------------
    livekit_url: str = os.environ.get("LIVEKIT_URL", "")
    livekit_api_key: str = os.environ.get("LIVEKIT_API_KEY", "")
    livekit_api_secret: str = os.environ.get("LIVEKIT_API_SECRET", "")
    livekit_room_name: str = os.environ.get("LIVEKIT_ROOM_NAME", "routiq-sleep-drive")
    livekit_identity_prefix: str = os.environ.get("LIVEKIT_IDENTITY_PREFIX", "driver")
    livekit_timeout: float = _env_float("LIVEKIT_TIMEOUT", 15.0)

    stt_provider: str = os.environ.get("STT_PROVIDER", "sarvam")
    tts_provider: str = os.environ.get("TTS_PROVIDER", "sarvam")
    # Cache deterministic TTS phrases (text+language -> base64 audio) to cut
    # latency + API spend. Personalized responses are never cached.
    tts_cache_enabled: bool = True

    # --- Sleep Drive conversation --------------------------------------------
    # Default conversation language. "auto" lets Sarvam's STT detect the
    # driver's language per utterance; anything else is a BCP-47 code.
    default_language: str = os.environ.get("SLEEP_DRIVE_LANGUAGE", "en-IN")

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

    @property
    def has_groq(self) -> bool:
        return bool(self.groq_api_key)

    @property
    def has_sarvam(self) -> bool:
        return bool(self.sarvam_api_key)

    @property
    def has_elevenlabs(self) -> bool:
        return bool(self.elevenlabs_api_key)

    @property
    def has_livekit(self) -> bool:
        return bool(self.livekit_url and self.livekit_api_key and self.livekit_api_secret)

    # --- Safety engine -------------------------------------------------------
    safety_weights: SafetyWeights = field(default_factory=SafetyWeights)
    segment_target_meters: float = _env_float("SEGMENT_TARGET_METERS", 750.0)
    max_segments: int = _env_int("MAX_SEGMENTS", 10)
    min_segments: int = _env_int("MIN_SEGMENTS", 4)
    hazard_radius_m: float = _env_float("HAZARD_RADIUS_METERS", 700.0)

    # --- Real Mumbai risk datasets -------------------------------------------
    # Distance within which a route segment is considered to pass near a
    # recorded high-risk corridor / blackspot junction / pedestrian blackspot.
    risk_match_radius_m: float = _env_float("RISK_MATCH_RADIUS_METERS", 1000.0)

    # --- Fatigue engine ------------------------------------------------------
    fatigue_thresholds: FatigueThresholds = field(default_factory=FatigueThresholds)

    # --- Emergency -----------------------------------------------------------
    emergency_countdown_seconds: int = _env_int("EMERGENCY_COUNTDOWN_SECONDS", 60)
    hospital_limit: int = _env_int("HOSPITAL_LIMIT", 6)
    hospital_search_radius_km: float = _env_float("HOSPITAL_SEARCH_RADIUS_KM", 15.0)
    # Number of nearest OSM hospitals we compute real OSRM ETAs for before ranking
    hospital_eta_candidates: int = _env_int("HOSPITAL_ETA_CANDIDATES", 12)

    # --- Storage -------------------------------------------------------------
    data_dir: str = os.environ.get("ROADSAFE_DATA_DIR", os.path.join(os.path.dirname(__file__), "data"))

    def __post_init__(self) -> None:
        self.safety_weights.validate()


settings = Settings()

# Geographic extent of Greater Mumbai. The real risk datasets only apply to
# routes inside this box — they must never be applied to other cities.
MUMBAI_BOUNDS = {
    "min_lat": 18.85,
    "max_lat": 19.32,
    "min_lon": 72.70,
    "max_lon": 73.10,
}

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

# ---------------------------------------------------------------------------
# Sleep Drive — supported conversation languages (BCP-47 codes)
# ---------------------------------------------------------------------------
# "auto" means: let Sarvam STT detect the driver's language per utterance and
# follow natural switches without restarting the session. The exact set mirrors
# the 10 Indian languages + Indian English that Sarvam Saaras v3 / Bulbul v3
# support, so a selection never points at an unsupported TTS/STT voice.
SUPPORTED_LANGUAGES: dict[str, str] = {
    "auto": "Auto-detect",
    "en-IN": "English",
    "hi-IN": "हिंदी",
    "ta-IN": "தமிழ்",
    "te-IN": "తెలుగు",
    "kn-IN": "ಕನ್ನಡ",
    "ml-IN": "മലയാളം",
    "mr-IN": "मराठी",
    "bn-IN": "বাংলা",
    "gu-IN": "ગુજરાતી",
    "pa-IN": "ਪੰਜਾਬੀ",
    "od-IN": "ଓଡ଼ିଆ",
}
