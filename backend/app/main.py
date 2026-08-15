"""RoadSafe AI — FastAPI backend.

Endpoints:
    GET  /api/health
    GET  /api/config                (weights, thresholds, provider status)
    POST /api/config                (override safety weights at runtime)
    GET  /api/route                 (route + per-segment safety scores)
    POST /api/safety-score          (score an arbitrary polyline)
    GET  /api/hazards               (near a point, user + real dataset data)
    POST /api/hazards               (submit a hazard)
    GET  /api/hospitals             (ranked by road ETA)
    POST /api/fatigue/session       (create a Sleep Drive session)
    POST /api/fatigue/event         (stream conversation events)
    POST /api/emergency/activate    (dynamic OSM hospitals + emergency number + countdown)
    GET  /api/emergency/route       (OSRM navigation route to the selected hospital)

No API keys are required to run — every provider has a demo fallback and the
response always declares whether data is LIVE or DEMO.
"""
from __future__ import annotations
import os
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from fastapi import FastAPI, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import RISK_LEVELS, SUPPORTED_LANGUAGES, SafetyWeights, settings
from app.models import (
    ConfigResponse,
    EmergencyActivateRequest,
    EmergencyResponse,
    EmergencyRouteResponse,
    FatigueChatRequest,
    FatigueChatResponse,
    FatigueEvent,
    FatigueSessionCreate,
    FatigueState,
    Hazard,
    HazardIn,
    Hospital,
    RouteAlternative,
    RouteResponse,
    SafetyScoreRequest,
    TranscribeResponse,
    TTSRequest,
    TTSResponse,
)
from app.providers.hazards import HazardService
from app.providers.hospitals import (
    HospitalProvider,
    HospitalProviderUnavailable,
    NoHospitalsFound,
)
from app.providers.overpass import HospitalSearchError
from app.providers.routing import (
    get_emergency_route,
    get_route,
    get_route_alternatives,
    polyline_length_km,
)
from app.providers.weather import get_weather
from app.services.ai import assistant_reply
from app.services.emergency import activate_emergency
from app.services.fatigue import FatigueEngine
from app.services.elevenlabs import elevenlabs_service
from app.services.http import Log
from app.services.groq import groq_service
from app.services.intent import classify_intent, merge_intent, target_language_for
from app.services.livekit import livekit_service
from app.services.rate_limit import RateLimiter
from app.services.safety_engine import SafetyEngine, overall_score
from app.services.sarvam import sarvam_service
from app.services.segmentation import segment_route
from app.services.risk_data import RiskDataService

# Real Mumbai risk datasets - loaded once, geocoded once, cached to disk.
risk_data = RiskDataService()


@asynccontextmanager
async def lifespan(_: FastAPI):
    # Geocode any dataset names missing from the master coordinates CSV
    # (network needed only on the very first run; afterwards offline).
    await risk_data.warm_up()
    yield


app = FastAPI(title="RoadSafe AI", version="0.1.0", lifespan=lifespan)

# --------------------------------------------------------------------------
# Rate limiting — protect the AI-provider budget from misbehaving clients.
# --------------------------------------------------------------------------
_ai_limiter = RateLimiter(30, 60, "ai")
_tts_limiter = RateLimiter(40, 60, "tts")
_stt_limiter = RateLimiter(30, 60, "stt")
_event_limiter = RateLimiter(120, 60, "events")
_emergency_limiter = RateLimiter(5, 60, "emergency")
_token_limiter = RateLimiter(10, 60, "elevenlabs")


def _limiter_for(path: str) -> RateLimiter | None:
    if path == "/api/elevenlabs/token":
        return _token_limiter
    if path == "/api/emergency/activate":
        return _emergency_limiter
    if path == "/api/fatigue/chat":
        return _ai_limiter
    if path == "/api/fatigue/audio/transcribe":
        return _stt_limiter
    if path == "/api/fatigue/tts":
        return _tts_limiter
    if path.startswith("/api/fatigue/"):
        return _event_limiter
    return None


@app.middleware("http")
async def rate_limit_ai(request: Request, call_next):
    limiter = _limiter_for(request.url.path)
    if limiter is not None:
        try:
            limiter.check(request)
        except HTTPException as exc:
            return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})
    return await call_next(request)

# CORS configuration — allows production frontend origin from environment variable
allowed_origins = os.environ.get("FRONTEND_URL", "*").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

hazards_svc = HazardService()
hospitals_svc = HospitalProvider()
safety = SafetyEngine(risk_data=risk_data)
fatigue = FatigueEngine()

# Startup banner — provider availability only, never keys.
Log.info(
    "main",
    "providers: groq=%s sarvam=%s elevenlabs=%s tts=%s default_language=%s"
    % (
        settings.groq_chat_model if settings.has_groq else "scripted fallback",
        "configured" if settings.has_sarvam else "browser fallback",
        "configured" if settings.has_elevenlabs else "off",
        settings.tts_provider,
        settings.default_language,
    ),
)

_APP_STARTED = time.time()


# --------------------------------------------------------------------------
# Health & config
# --------------------------------------------------------------------------

@app.get("/api/health")
async def health() -> dict:
    return {
        "status": "ok",
        "service": "roadsafe-ai-backend",
        "uptime_s": round(time.time() - _APP_STARTED, 1),
        "providers": {
            "groq": "configured" if settings.has_groq else "scripted fallback",
            "sarvam": "configured" if settings.has_sarvam else "browser fallback",
            "elevenlabs": "configured" if settings.has_elevenlabs else "off",
            "livekit": "configured" if settings.has_livekit else "off",
            "tts": settings.tts_provider,
        },
        "active_sessions": fatigue.session_count,
    }


@app.get("/api/config", response_model=ConfigResponse)
async def get_config() -> ConfigResponse:
    providers = {
        "routing": "tomtom" if settings.has_routing else "osrm + demo fallback",
        "hospitals": "openstreetmap (overpass)",
        "hazards": "demo layer + user reports",
        "traffic": "tomtom (live flow)" if settings.has_traffic else "demo (deterministic)",
        "weather": "openweather" if settings.has_weather else "demo (deterministic)",
        "ai": "gemini" if settings.has_ai else "scripted",
        "groq": settings.groq_chat_model if settings.has_groq else "unavailable",
        "sarvam_stt": settings.sarvam_stt_model if settings.has_sarvam else "unavailable",
        "sarvam_tts": settings.sarvam_tts_model if settings.has_sarvam else "unavailable",
        "elevenlabs_tts": settings.elevenlabs_voice_id if settings.has_elevenlabs else "unavailable",
        "livekit_room": settings.livekit_room_name if settings.has_livekit else "unavailable",
        "languages": str(len(SUPPORTED_LANGUAGES)),
        "risk_data": f"mumbai csv datasets ({risk_data.geocoded_count}/{len(risk_data.locations)} geocoded)",
    }
    keys = [k for k, v in {
        "ROUTING_API_KEY": settings.routing_api_key,
        "MAP_API_KEY": settings.map_api_key,
        "AI_API_KEY": settings.ai_api_key,
        "TRAFFIC_API_KEY": settings.traffic_api_key,
        "WEATHER_API_KEY": settings.weather_api_key,
        "GROQ_API_KEY": settings.groq_api_key,
        "SARVAM_API_KEY": settings.sarvam_api_key,
        "ELEVENLABS_API_KEY": settings.elevenlabs_api_key,
        "LIVEKIT_API_KEY": settings.livekit_api_key,
    }.items() if v]
    return ConfigResponse(
        safety_weights=settings.safety_weights.as_dict(),
        fatigue_thresholds=settings.fatigue_thresholds.as_dict(),
        risk_levels={k: v for k, v in RISK_LEVELS.items()},
        segment_target_meters=settings.segment_target_meters,
        max_segments=settings.max_segments,
        hazard_radius_m=settings.hazard_radius_m,
        risk_match_radius_m=settings.risk_match_radius_m,
        emergency_countdown_seconds=settings.emergency_countdown_seconds,
        providers=providers,
        api_keys_configured=keys,
    )


@app.post("/api/config")
async def update_config(weights: dict[str, float]) -> ConfigResponse:
    current = settings.safety_weights.as_dict()
    current.update({k: v for k, v in weights.items() if k in current})
    settings.safety_weights = SafetyWeights(**current)
    settings.safety_weights.validate()
    return await get_config()


# --------------------------------------------------------------------------
# Routes & safety scores
# --------------------------------------------------------------------------

@app.get("/api/route", response_model=RouteResponse)
async def route(
    start_lat: float = Query(ge=-90, le=90),
    start_lon: float = Query(ge=-180, le=180),
    end_lat: float = Query(ge=-90, le=90),
    end_lon: float = Query(ge=-180, le=180),
) -> RouteResponse:
    start, end = (start_lat, start_lon), (end_lat, end_lon)
    geometry, duration_min, source, provider, route_traffic = await get_route(start, end)
    segments_geo = segment_route(geometry)
    weather = await get_weather(geometry[len(geometry) // 2])
    segments = await safety.score_route_async(
        geometry, segments_geo, weather=weather, route_traffic=route_traffic)
    score, risk, color = overall_score(segments)
    hazards = hazards_svc.all_hazards(start, settings.hazard_radius_m * 3, limit=40)
    return RouteResponse(
        source=source,
        provider=provider,
        start=start,
        end=end,
        distance_km=round(polyline_length_km(geometry), 2),
        duration_min=round(duration_min, 1),
        geometry=geometry,
        segments=segments,
        overall_score=score,
        overall_risk=risk,
        overall_color=color,
        hazards=hazards,
        weather=weather,
    )


@app.get("/api/route/alternatives", response_model=list[RouteAlternative])
async def route_alternatives(
    start_lat: float = Query(ge=-90, le=90),
    start_lon: float = Query(ge=-180, le=180),
    end_lat: float = Query(ge=-90, le=90),
    end_lon: float = Query(ge=-180, le=180),
) -> list[RouteAlternative]:
    """Up to 3 selectable route options (fastest first), each with its own
    scored, color-coded geometry for the ride bottom sheet + map."""
    start, end = (start_lat, start_lon), (end_lat, end_lon)
    raw = await get_route_alternatives(start, end)
    out: list[RouteAlternative] = []
    for i, alt in enumerate(raw):
        geometry = alt["geometry"]
        if len(geometry) < 2:
            continue
        segments_geo = segment_route(geometry)
        weather = await get_weather(geometry[len(geometry) // 2])
        segments = await safety.score_route_async(geometry, segments_geo, weather=weather)
        score, risk, color = overall_score(segments)
        hazards = hazards_svc.all_hazards(start, settings.hazard_radius_m * 3, limit=40)
        out.append(RouteAlternative(
            id=f"alt-{i}",
            name="Fastest Route" if i == 0 else f"Alt Route {i}",
            start=start,
            end=end,
            distance_km=alt["distance_km"],
            duration_min=alt["duration_min"],
            overall_score=score,
            overall_risk=risk,
            overall_color=color,
            source=alt["source"],
            provider=alt["provider"],
            geometry=geometry,
            segments=segments,
            hazards=hazards,
        ))
    return out


@app.post("/api/safety-score")
async def safety_score(req: SafetyScoreRequest) -> RouteResponse:
    geometry = req.geometry
    if len(geometry) < 2:
        raise HTTPException(400, "Geometry must contain at least 2 points")
    segments_geo = segment_route(geometry)
    weather = await get_weather(geometry[len(geometry) // 2])
    segments = await safety.score_route_async(geometry, segments_geo, weather=weather)
    score, risk, color = overall_score(segments)
    return RouteResponse(
        source="demo",
        provider="inline",
        start=geometry[0],
        end=geometry[-1],
        distance_km=round(polyline_length_km(geometry), 2),
        duration_min=round(polyline_length_km(geometry) / 45.0 * 60.0, 1),
        geometry=geometry,
        segments=segments,
        overall_score=score,
        overall_risk=risk,
        overall_color=color,
        hazards=[],
    )


from app.providers.geocoding import GeocodingProvider, GeocodeResult

geocode_svc = GeocodingProvider()

@app.get("/api/geocode", response_model=list[GeocodeResult])
async def geocode_location(q: str = Query(..., min_length=1)) -> list[GeocodeResult]:
    return await geocode_svc.geocode(q)


@app.get("/api/reverse-geocode", response_model=GeocodeResult)
async def reverse_geocode_location(
    lat: float = Query(ge=-90, le=90),
    lon: float = Query(ge=-180, le=180),
) -> GeocodeResult:
    return await geocode_svc.reverse_geocode(lat, lon)

# --------------------------------------------------------------------------
# Hazards
# --------------------------------------------------------------------------

@app.get("/api/hazards", response_model=list[Hazard])
async def list_hazards(
    lat: float = Query(ge=-90, le=90, description="Center latitude"),
    lon: float = Query(ge=-180, le=180, description="Center longitude"),
    radius_m: float = 5000,
    limit: int = 40,
) -> list[Hazard]:
    """Real hazards only: user-submitted reports + real dataset blackspots.
    The fabricated demo hazard layer is excluded from this production feed."""
    user = hazards_svc.all_hazards((lat, lon), radius_m, limit, include_demo=False)
    dataset = risk_data.hazards_near((lat, lon), radius_m, limit)
    merged = user + dataset
    merged.sort(key=lambda h: h.distance_m if h.distance_m is not None else 1e9)
    return merged[:limit]


@app.post("/api/hazards", response_model=Hazard, status_code=201)
async def create_hazard(hazard: HazardIn) -> Hazard:
    return hazards_svc.create(hazard)


# --------------------------------------------------------------------------
# Hospitals
# --------------------------------------------------------------------------

@app.get("/api/hospitals", response_model=list[Hospital])
async def hospitals(
    lat: float = Query(ge=-90, le=90),
    lon: float = Query(ge=-180, le=180),
    limit: int | None = None,
) -> list[Hospital]:
    return await hospitals_svc.hospitals_near((lat, lon), limit)


# --------------------------------------------------------------------------
# Fatigue / Sleep Drive
# --------------------------------------------------------------------------

@app.post("/api/fatigue/session", response_model=FatigueState)
async def create_fatigue_session(req: FatigueSessionCreate) -> FatigueState:
    session = fatigue.create_session(
        req.driver_name, req.mode, req.thresholds, language=req.language or None
    )
    return fatigue.snapshot(session)


@app.post("/api/fatigue/event", response_model=FatigueState)
async def fatigue_event(event: FatigueEvent) -> FatigueState:
    state = fatigue.handle_event(event)
    if state is None:
        raise HTTPException(404, "Unknown fatigue session")
    return state


@app.get("/api/fatigue/state/{session_id}", response_model=FatigueState)
async def fatigue_state(session_id: str) -> FatigueState:
    session = fatigue.get(session_id)
    if session is None:
        raise HTTPException(404, "Unknown fatigue session")
    return fatigue.snapshot(session)


@app.get("/api/fatigue/session/{session_id}/events")
async def fatigue_events(session_id: str) -> dict:
    session = fatigue.get(session_id)
    if session is None:
        raise HTTPException(404, "Unknown fatigue session")
    return {
        "session_id": session_id,
        "events": [e.model_dump() for e in session.events],
    }


@app.post("/api/fatigue/chat", response_model=FatigueChatResponse)
async def fatigue_chat(req: FatigueChatRequest) -> FatigueChatResponse:
    """Bidirectional conversational turn.

    The driver may speak first (driver_text + driver_initiated intent) or the
    orchestrator may be issuing a proactive prompt (question) or reacting to
    a reply. The LLM (Groq) decides WHAT to say; the fatigue engine decides
    driver STATE; deterministic rules here decide whether any ACTION is
    permitted (never the LLM alone).
    """
    session = fatigue.get(req.session_id) if req.session_id else None
    # The driver's explicit selection (from the UI / manager) wins over the
    # session's stored value — this is how a mid-session language switch
    # from the client is honoured without restarting the session. "auto" is
    # NOT a real language: it means "use the session's current language"
    # (which the engine updates on genuine detected switches), so it must
    # never reach the LLM as a literal "auto" — that made Groq answer in a
    # language the driver never chose.
    language = (
        req.language
        if req.language and req.language != "auto"
        else (session.language if session else None) or "en-IN"
    )
    driver_text = (req.driver_text or "").strip()

    # ----------------------------------------------------------- intent
    # Deterministic safety rules first; Groq refines; safety-critical intents
    # (EMERGENCY / FATIGUE_DISCLOSURE) always win.
    if req.intent == "question":
        intent = "PROACTIVE_CHECKIN"
    elif req.intent == "reply":
        intent = "RESPONSE"
    else:
        model_intent = await groq_service.classify_intent(driver_text, language)
        intent = merge_intent(model_intent, driver_text)

    # -------------------------------------------------- language switching
    # Natural switching mid-session — never restarts the session.
    new_language = None
    if intent == "LANGUAGE_SWITCH" and driver_text:
        new_language = target_language_for(driver_text)
    if new_language and session:
        if new_language != session.language:
            old = session.language
            session.language = new_language
            fatigue.handle_event(
                FatigueEvent(
                    session_id=session.session_id,
                    event_type="language_changed",
                    language=new_language,
                    transcript=driver_text,
                )
            )
            language = new_language
            print(f"[chat] language switched {old} -> {new_language}", flush=True)
    elif session and language != session.language:
        session.language = language
        fatigue.handle_event(
            FatigueEvent(
                session_id=session.session_id,
                event_type="language_changed",
                language=language,
            )
        )

    # --------------------------------------------------------- event log
    if session and driver_text:
        fatigue.handle_event(
            FatigueEvent(
                session_id=session.session_id,
                event_type="intent_detected",
                intent=intent,
                transcript=driver_text,
                language=language,
            )
        )
        if req.intent in ("driver_initiated", "freeform") or (req.intent == "reply" and not session.last_question):
            fatigue.handle_event(
                FatigueEvent(
                    session_id=session.session_id,
                    event_type="driver_initiated",
                    transcript=driver_text,
                    language=language,
                )
            )

    # ------------------------------------------------------- driver state
    driver_state = None
    if session:
        snap = fatigue.snapshot(session)
        driver_state = {
            "state": snap.state,
            "fatigue_risk": snap.fatigue_risk,
            "engagement": snap.engagement,
            "confidence": snap.confidence,
            "recent_delayed_responses": snap.recent_delayed_responses,
            "silence_detected": snap.silence_detected,
            "baseline_latency_ms": snap.baseline_latency_ms,
        }

    # ------------------------------------------------------------- reply
    history = req.messages[-12:] or []
    action: dict | None = None

    # Scripted fallbacks per intent (human, concise — never a robot).
    scripted = _scripted_for(intent, session, driver_text)

    if req.intent == "question":
        reply = await groq_service.generate_response(
            history, driver_state, req.road_context, language, "PROACTIVE_CHECKIN"
        )
        source: str = "groq" if reply else "scripted"
        reply = reply or scripted
    elif driver_text:
        reply = await groq_service.generate_response(
            history, driver_state, req.road_context, language, intent
        )
        source = "groq" if reply else "scripted"
        reply = reply or scripted
        # The LLM PROPOSES an action; the app decides. Never executed here.
        action = _action_for(intent)
    else:
        reply, source = None, "scripted"
        reply = "I'm here when you need me."

    if session and source == "groq":
        fatigue.handle_event(
            FatigueEvent(
                session_id=session.session_id,
                event_type="ai_response_generated",
                transcript=reply,
                language=language,
            )
        )

    return FatigueChatResponse(
        reply=reply, source=source, intent=intent, language=language, action=action
    )


def _scripted_for(intent: str, session, driver_text: str) -> str:
    if not session:
        return "How's the drive going?"
    if intent == "PROACTIVE_CHECKIN":
        return fatigue.next_prompt(session)
    if intent == "EMERGENCY":
        return "Okay, I'm getting you help. Emergency services will be contacted — stay on the line with me if you can."
    if intent == "FATIGUE_DISCLOSURE":
        return "Your responses have slowed. If you're feeling tired, I'd strongly recommend finding a safe place to stop for a break."
    if intent == "ROUTE_REQUEST":
        return "Sure — I'm checking safer alternatives now."
    if intent == "SAFETY_QUERY":
        return "I can check the road ahead and compare the risk along your route."
    if intent == "MUSIC_REQUEST":
        return "Happy to play something. Want me to put on some music?"
    if intent == "LANGUAGE_SWITCH":
        return "Sure — I'll switch."
    if intent == "RESPONSE":
        return "Good to hear. I'll keep an eye on things."
    return "I'm here. Ask me about the road ahead, a safer route, or take a break whenever you need."


def _action_for(intent: str) -> dict | None:
    """Map a classified intent onto a permitted action proposal. The app
    (frontend policy layer) decides whether/how to execute it."""
    if intent == "EMERGENCY":
        return {"type": "emergency"}
    if intent == "FATIGUE_DISCLOSURE":
        return {"type": "fatigue_check"}
    if intent == "ROUTE_REQUEST":
        return {"type": "route_request"}
    if intent == "SAFETY_QUERY":
        return {"type": "safety_info"}
    if intent == "MUSIC_REQUEST":
        return {"type": "music_request"}  # frontend runs the consent flow
    return None


@app.post("/api/fatigue/audio/transcribe", response_model=TranscribeResponse)
async def fatigue_transcribe(
    file: UploadFile = File(...),
    language_hint: str = Form("auto"),
) -> TranscribeResponse:
    """Sarvam Saaras v3 STT. Any failure returns source="error" so the
    frontend falls back to browser STT — and NEVER raises fatigue risk."""
    audio = await file.read()
    if not audio:
        return TranscribeResponse(error="empty audio")
    result = await sarvam_service.transcribe(audio, language_hint=language_hint)
    if not result:
        return TranscribeResponse(
            transcript=None,
            language_code=language_hint if language_hint and language_hint != "auto" else "auto",
            source="browser",
            provider="browser",
            fallback=True,
            fallback_reason="SARVAM_API_ERROR",
            error="Sarvam STT unavailable — falling back to browser speech recognition",
        )
    return TranscribeResponse(
        transcript=result.get("transcript"),
        language_code=result.get("language_code") or (language_hint if language_hint and language_hint != "auto" else "auto"),
        source="sarvam",
        provider="sarvam",
        fallback=False,
    )


@app.post("/api/fatigue/tts", response_model=TTSResponse)
async def fatigue_tts(req: TTSRequest) -> TTSResponse:
    """Sarvam Bulbul v3 TTS -> base64 audio. Falls back to browser TTS by
    returning source="browser" (no audio) — the frontend decides."""
    if not req.text or not req.text.strip():
        return TTSResponse(message="empty text")
    result = None
    if settings.tts_provider == "elevenlabs":
        result = await elevenlabs_service.synthesize(req.text, req.language or "en-IN")
    else:
        result = await sarvam_service.synthesize(req.text, req.language or "en-IN")

    if not result:
        fallback_provider = settings.tts_provider if settings.tts_provider else "browser"
        return TTSResponse(
            source="browser",
            provider="browser",
            fallback=True,
            fallback_reason=f"{fallback_provider.upper()}_API_ERROR",
            message="Speech synthesis unavailable — using browser speech",
        )
    return TTSResponse(
        audio_base64=result.get("audio_base64"),
        format=result.get("format", "mp3" if result.get("format") == "mp3" else "wav"),
        source=result.get("source", settings.tts_provider),
        provider=result.get("provider", settings.tts_provider),
        cached=bool(result.get("cached")),
        fallback=False,
    )


@app.get("/api/elevenlabs/token")
async def get_elevenlabs_token():
    """Fetch a signed URL for the ElevenLabs Conversational AI Web SDK."""
    if not settings.elevenlabs_api_key or not settings.elevenlabs_agent_id:
        raise HTTPException(status_code=400, detail="ElevenLabs credentials or Agent ID not configured")

    import httpx
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(
                f"https://api.elevenlabs.io/v1/convai/conversation/get_signed_url?agent_id={settings.elevenlabs_agent_id}",
                headers={"xi-api-key": settings.elevenlabs_api_key},
                timeout=settings.elevenlabs_timeout,
            )
            response.raise_for_status()
            return response.json()
        except Exception as exc:  # never echo the upstream message — it can carry secrets
            Log.warn("elevenlabs", f"token endpoint failed ({type(exc).__name__})")
            raise HTTPException(
                status_code=502,
                detail="ElevenLabs token service unavailable — try again shortly.",
            ) from exc


@app.post("/api/livekit/token")
async def get_livekit_token(payload: dict | None = None):
    """Issue a short-lived LiveKit room token for Sleep Drive's voice session."""
    if not settings.has_livekit:
        raise HTTPException(status_code=400, detail="LiveKit credentials are not configured")

    body = payload or {}
    identity = str(body.get("identity") or f"{settings.livekit_identity_prefix}-{int(time.time() * 1000)}")
    room_name = str(body.get("room_name") or settings.livekit_room_name)
    try:
        token = livekit_service.create_token(identity=identity, room_name=room_name)
        return {
            "token": token,
            "room_name": room_name,
            "identity": identity,
            "url": settings.livekit_url,
            "provider": "livekit",
        }
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # pragma: no cover - unexpected LiveKit token generation failure
        Log.warn("livekit", f"token generation failed ({type(exc).__name__})")
        raise HTTPException(status_code=502, detail="LiveKit token service unavailable") from exc

# --------------------------------------------------------------------------
# Emergency
# --------------------------------------------------------------------------

@app.post("/api/emergency/activate", response_model=EmergencyResponse)
async def emergency_activate(req: EmergencyActivateRequest) -> EmergencyResponse:
    try:
        return await activate_emergency((req.lat, req.lon), radius_km=req.radius_km)
    except HospitalProviderUnavailable:
        raise HTTPException(status_code=503, detail="HOSPITAL_PROVIDER_UNAVAILABLE") from None
    except NoHospitalsFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from None
    except HospitalSearchError:
        raise HTTPException(
            status_code=503,
            detail="Unable to retrieve nearby hospitals right now.",
        ) from None


@app.get("/api/emergency/route", response_model=EmergencyRouteResponse)
async def emergency_route(
    start_lat: float = Query(ge=-90, le=90),
    start_lon: float = Query(ge=-180, le=180),
    end_lat: float = Query(ge=-90, le=90),
    end_lon: float = Query(ge=-180, le=180),
    hospital_id: str = "",
) -> EmergencyRouteResponse:
    start, end = (start_lat, start_lon), (end_lat, end_lon)
    result = await get_emergency_route(start, end)
    if result is None:
        raise HTTPException(
            status_code=502,
            detail="Unable to calculate driving route to the selected hospital.",
        )
    return EmergencyRouteResponse(
        source=result["source"],
        provider=result["provider"],
        start=start,
        end=end,
        distance_km=result["distance_km"],
        duration_min=result["duration_min"],
        geometry=result["geometry"],
        steps=result["steps"],
        hospital_id=hospital_id,
    )
