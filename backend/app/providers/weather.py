"""Weather conditions for the safety engine (OpenWeather when keyed).

Returns a normalized dict or None. Rain/fog/night make lighting and road
quality worse; snow/rain make surfaces slippery. This is a modifier on top
of the deterministic layers — never a whole new weight.
"""
from __future__ import annotations

import hashlib
from datetime import datetime, timezone

import httpx

from app.config import settings
from app.providers.base import Point

_WEATHER_CACHE: dict[tuple[float, float], dict | None] = {}


def _hash01(*parts: object) -> float:
    raw = "|".join(str(p) for p in parts).encode()
    return int(hashlib.md5(raw).hexdigest()[:8], 16) / 0xFFFFFFFF


async def get_weather(point: Point) -> dict | None:
    lat, lon = point
    key = (round(lat, 2), round(lon, 2))
    if key in _WEATHER_CACHE:
        return _WEATHER_CACHE[key]

    if settings.has_weather:
        try:
            async with httpx.AsyncClient(timeout=settings.tomtom_timeout) as client:
                resp = await client.get(
                    settings.openweather_url,
                    params={"lat": lat, "lon": lon, "appid": settings.weather_api_key, "units": "metric"},
                )
                resp.raise_for_status()
                data = resp.json()
            now = datetime.now(timezone.utc).timestamp() + (data.get("timezone") or 0)
            sunrise = data.get("sys", {}).get("sunrise") or 0
            sunset = data.get("sys", {}).get("sunset") or 0
            main = (data.get("weather") or [{}])[0].get("main", "Clear")
            result = {
                "main": main,
                "description": (data.get("weather") or [{}])[0].get("description", ""),
                "temp_c": round(data.get("main", {}).get("temp", 20), 1),
                "visibility_m": data.get("visibility"),
                "wind_ms": round(data.get("wind", {}).get("speed", 0), 1),
                "clouds_pct": data.get("clouds", {}).get("all", 0),
                "is_night": bool(sunrise and sunset and (now < sunrise or now > sunset)),
                "source": "live",
            }
            _WEATHER_CACHE[key] = result
            return result
        except Exception:
            pass

    # deterministic demo conditions (stable per grid cell)
    r = _hash01("weather", key[0], key[1])
    mains = ["Clear", "Clear", "Clouds", "Clouds", "Rain", "Fog"]
    main = mains[int(r * len(mains))]
    result = {
        "main": main,
        "description": main.lower(),
        "temp_c": round(14 + r * 18, 1),
        "visibility_m": 10000 if main in ("Clear", "Clouds") else 3500,
        "wind_ms": round(2 + r * 9, 1),
        "clouds_pct": 10 if main == "Clear" else 75 if main == "Clouds" else 90,
        "is_night": False,
        "source": "demo",
    }
    _WEATHER_CACHE[key] = result
    return result


def weather_modifiers(weather: dict | None) -> dict[str, float]:
    """Returns lighting/quality/traffic penalties (0..40) from conditions."""
    out = {"lighting": 0.0, "road_quality": 0.0, "traffic": 0.0}
    if not weather:
        return out
    main = weather.get("main", "")
    if weather.get("is_night"):
        out["lighting"] += 14
    if main in ("Rain", "Drizzle", "Thunderstorm", "Snow"):
        out["lighting"] += 10
        out["road_quality"] += 14
        out["traffic"] += 10
    if main == "Snow":
        out["road_quality"] += 10
        out["traffic"] += 6
    if main in ("Fog", "Mist", "Haze", "Smoke"):
        out["lighting"] += 18
        out["traffic"] += 8
    return out
