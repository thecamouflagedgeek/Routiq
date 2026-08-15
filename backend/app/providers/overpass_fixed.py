"""OpenStreetMap Overpass provider — dynamic amenity discovery.

EMERGENCY FIX: Proper headers, form encoding, single mirror, fast timeout.
"""
from __future__ import annotations

import time

import httpx

from app.config import settings
from app.providers.base import Point
from app.services.http import Log


class HospitalSearchError(RuntimeError):
    """Raised when Overpass could not be reached for hospital discovery."""


# In-memory cache: 5-minute TTL, keyed by rounded coordinates
_OVERPASS_CACHE: dict[str, tuple[list[dict], float]] = {}
_CACHE_TTL_SECONDS = 300


def _cache_key(lat: float, lon: float, radius_km: float) -> str:
    return f"{round(lat, 2):.2f},{round(lon, 2):.2f},{radius_km}"


def _get_cached(key: str) -> list[dict] | None:
    if key not in _OVERPASS_CACHE:
        return None
    result, timestamp = _OVERPASS_CACHE[key]
    if time.time() - timestamp > _CACHE_TTL_SECONDS:
        del _OVERPASS_CACHE[key]
        return None
    return result


def _set_cache(key: str, result: list[dict]) -> None:
    _OVERPASS_CACHE[key] = (result, time.time())


def _build_query(lat: float, lon: float, radius_km: float, timeout: int) -> str:
    """Build simple Overpass QL query - only essential fields."""
    radius_m = int(radius_km * 1000)
    timeout = min(timeout, 10)  # Max 10 seconds for emergency
    return (
        f"[out:json][timeout:{timeout}];"
        "("
        f'node["amenity"="hospital"](around:{radius_m},{lat},{lon});'
        f'way["amenity"="hospital"](around:{radius_m},{lat},{lon});'
        f'relation["amenity"="hospital"](around:{radius_m},{lat},{lon});'
        ");"
        "out center tags;"
    )


def _address_from(tags: dict[str, str]) -> str:
    parts = []
    for key in ("addr:housenumber", "addr:street", "addr:suburb", "addr:city", "addr:postcode"):
        value = (tags.get(key) or "").strip()
        if value:
            parts.append(value)
    if not parts:
        full = (tags.get("addr:full") or "").strip()
        if full:
            return full
        return ""
    return ", ".join(parts)


def _parse_elements(elements: list[dict]) -> list[dict]:
    """Convert Overpass elements into plain hospital dicts."""
    seen: set[tuple[str, str]] = set()
    hospitals: list[dict] = []
    for el in elements:
        etype = el.get("type", "")
        eid = el.get("id")
        tags = el.get("tags") or {}
        if "amenity" in tags and tags["amenity"] != "hospital":
            continue
        if etype == "node":
            lat, lon = el.get("lat"), el.get("lon")
        else:
            center = el.get("center") or {}
            lat, lon = center.get("lat"), center.get("lon")
        if lat is None or lon is None:
            continue
        lat = round(float(lat), 6)
        lon = round(float(lon), 6)
        name = (tags.get("name") or "").strip()
        key = (name or "unnamed", f"{lat:.5f},{lon:.5f}")
        if key in seen:
            continue
        seen.add(key)
        hospitals.append({
            "id": f"osm-{etype}-{eid}",
            "name": name,
            "address": _address_from(tags),
            "lat": lat,
            "lon": lon,
            "phone": (tags.get("phone") or tags.get("contact:phone") or "").strip(),
        })
    return hospitals


async def query_hospitals(point: Point, radius_km: float) -> list[dict]:
    """Query Overpass for hospitals - EMERGENCY OPTIMIZED.
    
    - Tries Geoapify first (if configured)
    - Single Overpass mirror attempt (no multi-retry)
    - Proper headers (fixes 406 error)
    - Form-encoded data (fixes 400 error)
    - 10-second timeout max
    - Results cached for 5 minutes
    """
    lat, lon = point
    
    # Validate coordinates
    if not (-90 <= lat <= 90) or not (-180 <= lon <= 180):
        raise HospitalSearchError(f"Invalid coordinates: lat={lat}, lon={lon}")
    
    # Check cache
    cache_key = _cache_key(lat, lon, radius_km)
    cached = _get_cached(cache_key)
    if cached is not None:
        Log.info("overpass", f"cache hit ({len(cached)} hospitals)")
        return cached
    
    Log.info("overpass", f"[Emergency] querying hospitals near {lat:.4f},{lon:.4f} r={radius_km}km")
    
    # Try Geoapify first (much faster and more reliable)
    if settings.has_geoapify:
        try:
            from app.providers.geoapify import GeoapifyProvider
            geo = GeoapifyProvider()
            hospitals = await geo.find_hospitals(point, radius_km)
            if hospitals:
                _set_cache(cache_key, hospitals)
                Log.info("overpass", f"[Emergency] geoapify: {len(hospitals)} hospitals")
                return hospitals
        except Exception as exc:
            Log.warn("overpass", f"geoapify failed: {type(exc).__name__}, trying overpass")
    
    # Build query
    timeout = 10
    query = _build_query(lat, lon, radius_km, timeout)
    Log.info("overpass", f"[Emergency] query: {query[:80]}...")
    
    # Get primary mirror
    url = settings.overpass_urls[0] if settings.overpass_urls else None
    if not url:
        raise HospitalSearchError("No Overpass URL configured")
    
    Log.info("overpass", f"[Emergency] requesting {url}")
    
    try:
        # CRITICAL FIX: Proper headers
        headers = {
            "User-Agent": "RoadSafeAI/1.0 emergency-hospital-service",
            "Accept": "application/json",
            "Content-Type": "application/x-www-form-urlencoded; charset=utf-8",
        }
        
        # CRITICAL FIX: Form data, not multipart files
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.post(
                url,
                headers=headers,
                data={"data": query},  # Form-encoded
            )
            resp.raise_for_status()
            data = resp.json()
        
        # Check Overpass remarks
        remark = (data.get("remark") or "").lower()
        if "timeout" in remark or "error" in remark:
            raise RuntimeError(f"Overpass error: {remark}")
        
        # Parse hospitals
        hospitals = _parse_elements(data.get("elements") or [])
        
        if hospitals:
            _set_cache(cache_key, hospitals)
            Log.info("overpass", f"[Emergency] success: {len(hospitals)} hospitals")
            return hospitals
        else:
            Log.warn("overpass", "[Emergency] no hospitals found")
            _set_cache(cache_key, [])
            return []
            
    except httpx.HTTPStatusError as exc:
        status = exc.response.status_code
        body = exc.response.text[:200]
        Log.warn("overpass", f"[Emergency] HTTP {status}: {body}")
        raise HospitalSearchError(f"Overpass HTTP {status}") from exc
    except httpx.TimeoutException as exc:
        Log.warn("overpass", "[Emergency] timeout")
        raise HospitalSearchError("Overpass timeout") from exc
    except Exception as exc:
        Log.warn("overpass", f"[Emergency] error: {type(exc).__name__}: {exc}")
        raise HospitalSearchError(f"Overpass error: {type(exc).__name__}") from exc
