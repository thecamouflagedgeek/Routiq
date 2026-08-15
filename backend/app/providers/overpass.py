"""OpenStreetMap Overpass provider — dynamic amenity discovery.

Hospitals are queried live from OpenStreetMap around the driver's actual
coordinates. Nothing here is hardcoded: the same query works in Mumbai,
Delhi, London, New York, or anywhere else Overpass has data.

If every Overpass mirror fails we raise HospitalSearchError so callers can
surface a clear error instead of falling back to fake hospitals.
"""
from __future__ import annotations

import httpx

from app.config import settings
from app.providers.base import Point
from app.services.http import Log, request_with_retry


class HospitalSearchError(RuntimeError):
    """Raised when Overpass could not be reached for hospital discovery."""


def _build_query(lat: float, lon: float, radius_km: float, timeout: int) -> str:
    radius_m = int(radius_km * 1000)
    return (
        "[out:json][timeout:{timeout}];"
        "("
        'node["amenity"="hospital"](around:{radius},{lat},{lon});'
        'way["amenity"="hospital"](around:{radius},{lat},{lon});'
        'relation["amenity"="hospital"](around:{radius},{lat},{lon});'
        ");"
        "out center tags;"
    ).format(lat=lat, lon=lon, radius=radius_m, timeout=timeout)


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
    """Convert Overpass elements into plain hospital dicts.

    Ways/relations use their computed center point. Hospitals without a
    name keep an empty name — the UI displays "Hospital" for those rather
    than us inventing one.
    """
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
    """Query OpenStreetMap/Overpass for hospitals within `radius_km`.

    Tries each configured Overpass mirror in order, retrying transient
    failures (timeouts / 429 / 5xx) on each mirror before moving to the
    next one — the same retry policy Groq/Sarvam/ElevenLabs already get.
    Raises HospitalSearchError when no mirror answers with valid data.
    """
    lat, lon = point
    timeout = int(max(10, min(60, settings.overpass_timeout)))
    query = _build_query(lat, lon, radius_km, timeout)
    last_error: Exception | None = None
    empty_mirrors = 0
    for url in settings.overpass_urls:
        if not url:
            continue
        try:
            resp = await request_with_retry(
                "POST",
                url,
                json=None,
                files={"data": (None, query)},
                timeout=timeout,
                tag="overpass",
            )
            resp.raise_for_status()
            data = resp.json()
        except Exception as exc:  # noqa: BLE001 - network/parse failures fall through to next mirror
            last_error = exc
            Log.warn("overpass", f"mirror failed ({url}): {type(exc).__name__}: {exc}")
            continue
        remark = (data.get("remark") or "").lower()
        if "timeout" in remark or "error" in remark:
            last_error = RuntimeError(remark)
            Log.warn("overpass", f"mirror returned remark ({url}): {remark}")
            continue
        hospitals = _parse_elements(data.get("elements") or [])
        if hospitals:
            return hospitals
        # One mirror may serve partial/empty data — keep trying others before
        # concluding "no hospitals" (only a unanimous empty result counts).
        empty_mirrors += 1
    if empty_mirrors == 0:
        Log.warn("overpass", f"all mirrors failed, last_error={last_error}")
        raise HospitalSearchError(f"Overpass unavailable: {last_error}") from last_error
    return []  # every reachable mirror agreed there are no hospitals nearby