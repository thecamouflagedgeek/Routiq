"""Geoapify provider — Places + Route Matrix + Routing.

Fast, reliable alternative to public OSRM/Overpass with a generous free tier.
When GEOAPIFY_API_KEY is configured, this replaces:
- Overpass for hospital discovery (Places API)
- OSRM /table for ETA ranking (Route Matrix API)
- OSRM /route for navigation (Routing API)
"""
from __future__ import annotations

import httpx

from app.config import settings
from app.providers.base import Point
from app.services.http import Log


class GeoapifyProvider:
    """Geoapify Places + Routing + Matrix."""

    name = "geoapify"

    def __init__(self) -> None:
        self._key = settings.geoapify_api_key
        self._base = settings.geoapify_url
        self._timeout = settings.geoapify_timeout

    async def find_hospitals(
        self, point: Point, radius_km: float
    ) -> list[dict]:
        """Find hospitals using Geoapify Places API.
        
        Returns list of dicts with: id, name, address, lat, lon, phone.
        Much faster than Overpass and doesn't rate-limit."""
        lat, lon = point
        radius_m = int(radius_km * 1000)
        
        # Geoapify uses circle filter: center point + radius
        url = (
            f"{self._base}/v2/places"
            f"?categories=healthcare.hospital"
            f"&filter=circle:{lon},{lat},{radius_m}"
            f"&limit=50"
            f"&apiKey={self._key}"
        )
        
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                resp = await client.get(url)
                resp.raise_for_status()
                data = resp.json()
            
            features = data.get("features") or []
            hospitals: list[dict] = []
            
            for feature in features:
                props = feature.get("properties") or {}
                geom = feature.get("geometry") or {}
                coords = geom.get("coordinates") or []
                
                if len(coords) < 2:
                    continue
                
                # Geoapify returns [lon, lat]
                lon_h, lat_h = coords[0], coords[1]
                
                name = (props.get("name") or "").strip()
                if not name:
                    name = props.get("address_line1", "Hospital")
                
                # Build address from components
                address_parts = []
                for key in ["street", "suburb", "city", "postcode"]:
                    val = (props.get(key) or "").strip()
                    if val:
                        address_parts.append(val)
                address = ", ".join(address_parts) if address_parts else ""
                
                hospitals.append({
                    "id": f"geoapify-{props.get('place_id', len(hospitals))}",
                    "name": name,
                    "address": address,
                    "lat": round(lat_h, 6),
                    "lon": round(lon_h, 6),
                    "phone": (props.get("contact") or {}).get("phone", ""),
                })
            
            Log.info("geoapify", f"found {len(hospitals)} hospitals near {lat:.4f},{lon:.4f}")
            return hospitals
            
        except Exception as exc:
            Log.warn("geoapify", f"places query failed: {type(exc).__name__}: {exc}")
            return []

    async def route_matrix(
        self, source: Point, destinations: list[Point]
    ) -> list[float | None]:
        """Calculate travel times from one source to multiple destinations.
        
        Uses Geoapify Route Matrix API — ONE call for all destinations.
        Returns list of durations in minutes (None = unreachable)."""
        if not destinations:
            return []
        
        # Build request body
        sources = [{"location": [source[1], source[0]]}]  # [lon, lat]
        targets = [{"location": [d[1], d[0]]} for d in destinations]
        
        url = f"{self._base}/v1/routematrix?apiKey={self._key}"
        payload = {
            "mode": "drive",
            "sources": sources,
            "targets": targets,
        }
        
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                resp = await client.post(url, json=payload)
                resp.raise_for_status()
                data = resp.json()
            
            # Response: {"sources_to_targets": [[dur0, dur1, ...], ...]}
            matrix = data.get("sources_to_targets") or [[]]
            if not matrix or not matrix[0]:
                return [None] * len(destinations)
            
            # First row = from our single source to all targets
            row = matrix[0]
            result: list[float | None] = []
            for dur in row:
                if dur is None or dur < 0:
                    result.append(None)
                else:
                    result.append(dur / 60.0)  # seconds -> minutes
            
            return result
            
        except Exception as exc:
            Log.warn("geoapify", f"route matrix failed: {type(exc).__name__}: {exc}")
            return [None] * len(destinations)

    async def route_with_steps(
        self, start: Point, end: Point
    ) -> tuple[list[list[float]], float, float, list[dict]] | None:
        """Full route with geometry and turn-by-turn steps.
        
        Returns (geometry, distance_km, duration_min, steps) or None."""
        lat1, lon1 = start
        lat2, lon2 = end
        
        url = (
            f"{self._base}/v1/routing"
            f"?waypoints={lat1},{lon1}|{lat2},{lon2}"
            f"&mode=drive"
            f"&apiKey={self._key}"
        )
        
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                resp = await client.get(url)
                resp.raise_for_status()
                data = resp.json()
            
            features = data.get("features") or []
            if not features:
                return None
            
            feature = features[0]
            props = feature.get("properties") or {}
            geom = feature.get("geometry") or {}
            
            # Extract geometry
            coords = geom.get("coordinates") or []
            if not coords:
                return None
            
            # Geoapify returns [[[lon, lat], ...]] (nested)
            if coords and isinstance(coords[0], list) and isinstance(coords[0][0], list):
                coords = coords[0]  # unwrap
            
            geometry = [[lat, lon] for lon, lat in coords]
            
            distance_km = props.get("distance", 0) / 1000.0
            duration_min = props.get("time", 0) / 60.0
            
            # Extract steps from legs
            steps: list[dict] = []
            legs = props.get("legs") or []
            for leg in legs:
                for step in leg.get("steps") or []:
                    instruction = step.get("instruction", {}).get("text", "Continue")
                    distance_m = int(step.get("distance", 0))
                    steps.append({
                        "instruction": instruction,
                        "distance_m": distance_m,
                        "name": "",
                    })
            
            return geometry, distance_km, duration_min, steps
            
        except Exception as exc:
            Log.warn("geoapify", f"routing failed: {type(exc).__name__}: {exc}")
            return None
