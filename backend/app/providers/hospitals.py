"""Hospital provider — live OpenStreetMap/Overpass discovery ranked by road ETA.

No hardcoded hospitals: candidates come from Overpass around the driver's
actual GPS coordinates (configurable radius, default 15 km). Each candidate's
road ETA comes from live OSRM routing. Hospitals OSRM cannot route are kept
with eta_min=None ("Driving time unavailable") and pushed below ranked ones —
we never substitute a fabricated ETA.

When GEOAPIFY_API_KEY is configured, Geoapify is used instead (faster, no rate limits).
"""
from __future__ import annotations

from app.config import settings
from app.models import Hospital
from app.providers.base import Point
from app.providers.overpass import query_hospitals
from app.providers.routing import get_osrm_durations_batch, haversine_km
from app.services.http import Log


class HospitalProviderUnavailable(RuntimeError):
    """Raised when Emergency's required live hospital provider is unavailable."""


class NoHospitalsFound(RuntimeError):
    """Raised when a live emergency search completes with no hospitals."""


class HospitalProvider:
    name = "hospitals"

    async def hospitals_near(
        self,
        point: Point,
        limit: int | None = None,
        radius_km: float | None = None,
        require_geoapify: bool = False,
    ) -> list[Hospital]:
        """Rank hospitals by real road ETA around `point`.

        Raises HospitalSearchError when Overpass is unreachable — callers
        surface that as a clear error instead of showing fake hospitals.
        
        Uses Geoapify when configured (much faster), falls back to Overpass."""
        limit = limit or settings.hospital_limit
        radius = radius_km or settings.hospital_search_radius_km

        # Emergency explicitly requires Geoapify. Other existing hospital
        # consumers retain their Overpass fallback.
        if require_geoapify and not settings.has_geoapify:
            raise HospitalProviderUnavailable("HOSPITAL_PROVIDER_UNAVAILABLE")

        # Try Geoapify first if configured.
        if settings.has_geoapify:
            from app.providers.geoapify import GeoapifyProvider, GeoapifyProviderError
            geo = GeoapifyProvider()
            try:
                # Fetch a generous candidate set (Places returns relevance-
                # ordered results, so asking for exactly the ETA-candidate
                # count would silently drop the nearest hospitals — the
                # wrong-location bug). The distance sort + trim below picks
                # the true nearest `hospital_eta_candidates`.
                candidates = await geo.find_hospitals(point, radius)
            except GeoapifyProviderError as exc:
                if require_geoapify:
                    raise HospitalProviderUnavailable("HOSPITAL_PROVIDER_UNAVAILABLE") from exc
                candidates = await query_hospitals(point, radius)
            Log.info("hospitals", f"geoapify returned {len(candidates)} candidates")
        else:
            candidates = await query_hospitals(point, radius)
            Log.info("hospitals", f"overpass returned {len(candidates)} candidates")

        if require_geoapify and not candidates:
            raise NoHospitalsFound(f"No hospitals found within {radius:g} km.")
        
        # Straight-line distance only picks *candidates*; final ranking is road ETA.
        candidates.sort(key=lambda h: haversine_km((h["lat"], h["lon"]), point))
        candidates = candidates[: settings.hospital_eta_candidates]

        # PERFORMANCE FIX: Use batch route matrix — ONE call for all hospitals
        # Geoapify Route Matrix if configured, else OSRM /table
        if settings.has_geoapify:
            from app.providers.geoapify import GeoapifyProvider
            geo = GeoapifyProvider()
            destinations = [(h["lat"], h["lon"]) for h in candidates]
            etas = await geo.route_matrix(point, destinations)
            Log.info("hospitals", "used geoapify route matrix for ETAs")
        else:
            destinations = [(h["lat"], h["lon"]) for h in candidates]
            etas = await get_osrm_durations_batch(point, destinations)
            Log.info("hospitals", "used osrm /table for ETAs")

        hospitals: list[Hospital] = []
        for h, eta_min in zip(candidates, etas):
            distance = haversine_km((h["lat"], h["lon"]), point)
            hospitals.append(Hospital(
                id=h["id"],
                name=h["name"],
                address=h.get("address", ""),
                lat=h["lat"],
                lon=h["lon"],
                distance_km=round(distance, 2),
                eta_min=round(eta_min, 1) if eta_min is not None else None,
                phone=h.get("phone", ""),
                source="live",
                eta_source="live" if eta_min is not None else "unavailable",
            ))

        # Fastest reachable hospital first (road ETA), then unroutable ones by
        # distance so the user still sees what exists nearby.
        hospitals.sort(
            key=lambda h: (
                h.eta_min is None,
                h.eta_min if h.eta_min is not None else float("inf"),
                h.distance_km,
            )
        )
        return hospitals[:limit]
