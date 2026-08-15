"""RoadSafe AI — FastAPI backend.

Endpoints:
    GET  /api/health
    GET  /api/config                (weights, thresholds, provider status)
    POST /api/config                (override safety weights at runtime)
    GET  /api/route                 (route + per-segment safety scores)
    POST /api/safety-score          (score an arbitrary polyline)
    GET  /api/hazards               (near a point, demo + user data)
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

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from app.config import RISK_LEVELS, SafetyWeights, settings
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
    RouteResponse,
    SafetyScoreRequest,
)
from app.providers.hazards import HazardService
from app.providers.hospitals import HospitalProvider
from app.providers.overpass import HospitalSearchError
from app.providers.routing import get_emergency_route, get_route, polyline_length_km
from app.providers.weather import get_weather
from app.services.ai import assistant_reply
from app.services.emergency import activate_emergency
from app.services.fatigue import FatigueEngine
from app.services.safety_engine import SafetyEngine, overall_score
from app.services.segmentation import segment_route

app = FastAPI(title="RoadSafe AI", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

hazards_svc = HazardService()
hospitals_svc = HospitalProvider()
safety = SafetyEngine()
fatigue = FatigueEngine()


# --------------------------------------------------------------------------
# Health & config
# --------------------------------------------------------------------------

@app.get("/api/health")
async def health() -> dict:
    return {"status": "ok", "service": "roadsafe-ai-backend"}


@app.get("/api/config", response_model=ConfigResponse)
async def get_config() -> ConfigResponse:
    providers = {
        "routing": "tomtom" if settings.has_routing else "osrm + demo fallback",
        "hospitals": "openstreetmap (overpass)",
        "hazards": "demo layer + user reports",
        "traffic": "tomtom (live flow)" if settings.has_traffic else "demo (deterministic)",
        "weather": "openweather" if settings.has_weather else "demo (deterministic)",
        "ai": "gemini" if settings.has_ai else "scripted",
    }
    keys = [k for k, v in {
        "ROUTING_API_KEY": settings.routing_api_key,
        "MAP_API_KEY": settings.map_api_key,
        "AI_API_KEY": settings.ai_api_key,
        "TRAFFIC_API_KEY": settings.traffic_api_key,
        "WEATHER_API_KEY": settings.weather_api_key,
    }.items() if v]
    return ConfigResponse(
        safety_weights=settings.safety_weights.as_dict(),
        fatigue_thresholds=settings.fatigue_thresholds.as_dict(),
        risk_levels={k: v for k, v in RISK_LEVELS.items()},
        segment_target_meters=settings.segment_target_meters,
        max_segments=settings.max_segments,
        hazard_radius_m=settings.hazard_radius_m,
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
    return hazards_svc.all_hazards((lat, lon), radius_m, limit)


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
    session = fatigue.create_session(req.driver_name, req.thresholds)
    return fatigue.snapshot(session)


@app.post("/api/fatigue/event", response_model=FatigueState)
async def fatigue_event(event: FatigueEvent) -> FatigueState:
    state = fatigue.handle_event(event)
    if state is None:
        raise HTTPException(404, "Unknown fatigue session")
    return state


@app.post("/api/fatigue/chat", response_model=FatigueChatResponse)
async def fatigue_chat(req: FatigueChatRequest) -> FatigueChatResponse:
    """AI-powered Sleep Drive conversation (Gemini when keyed, scripted otherwise)."""
    session = fatigue.get(req.session_id) if req.session_id else None
    if req.intent == "question":
        scripted = fatigue.next_question(session) if session else "How's the drive going?"
    elif req.intent == "reply":
        scripted = "Got it — thanks for staying with me. I'll keep checking in."
    else:
        scripted = "I'm here to help with road safety. Ask me anything about your route, fatigue, or hazards."
    reply, source = await assistant_reply(req.intent, req.messages, scripted, req.session_id)
    return FatigueChatResponse(reply=reply, source=source)


# --------------------------------------------------------------------------
# Emergency
# --------------------------------------------------------------------------

@app.post("/api/emergency/activate", response_model=EmergencyResponse)
async def emergency_activate(req: EmergencyActivateRequest) -> EmergencyResponse:
    try:
        return await activate_emergency((req.lat, req.lon), radius_km=req.radius_km)
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
