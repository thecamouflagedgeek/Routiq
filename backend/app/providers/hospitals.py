"""Hospital provider — live OpenStreetMap/Overpass discovery ranked by road ETA.

No hardcoded hospitals: candidates come from Overpass around the driver's
actual GPS coordinates (configurable radius, default 15 km). Each candidate's
road ETA comes from live OSRM routing. Hospitals OSRM cannot route are kept
with eta_min=None (\"Driving time unavailable\") and pushed below ranked ones —
we never substitute a fabricated ETA.
"""
from __future__ import annotations

import asyncio

from app.config import settings
from app.models import Hospital
from app.providers.base import Point
from app.providers.overpass import query_hospitals
from app.providers.routing import get_osrm_duration_min, haversine_km


class HospitalProvider:
    name = "hospitals"

    async def hospitals_near(
        self,
        point: Point,
        limit: int | None = None,
        radius_km: float | None = None,
    ) -> list[Hospital]:
        """Rank hospitals by real road ETA around `point`.

    def _generate_demo(self, point: Point, count: int = 8) -> list[dict]:
        lat, lon = point
        out = []
        for i in range(count):
            bearing = 2 * 3.14159 * _hash01("bear", i, point)
            dist = 0.004 + _hash01("dist", i, point) * 0.05  # 0.4 .. 5.5 km
            hlat = lat + dist * 0.9 * _hash01("hlat", i, point)
            hlon = lon + dist * 0.9 * _hash01("hlon", i, point)
            out.append({
                "id": f"demo-hosp-{i}",
                "name": DEMO_PREFIXES[int(_hash01("n", i, point) * len(DEMO_PREFIXES))],
                "address": "Demo location (no hospital dataset nearby)",
                "lat": round(hlat, 6),
                "lon": round(hlon, 6),
                "phone": "",
            })
        return out

    async def hospitals_near(self, point: Point, limit: int | None = None,
                               radius_km: float | None = None) -> list[Hospital]:
        limit = limit or settings.hospital_limit
        candidates = self._candidates(point, limit)
        if radius_km:
            candidates = [h for h in candidates
                          if haversine_km((h["lat"], h["lon"]), point) <= radius_km]

        candidates = await query_hospitals(point, radius)
        # Straight-line distance only picks *candidates*; final ranking is road ETA.
        candidates.sort(key=lambda h: haversine_km((h["lat"], h["lon"]), point))
        candidates = candidates[: settings.hospital_eta_candidates]

        async def eta(h: dict) -> float | None:
            return await get_osrm_duration_min((h["lat"], h["lon"]), point)

        etas = await asyncio.gather(*(eta(h) for h in candidates))

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
