"""Hospital provider.

Uses a bundled dataset of real hospitals (LA + NYC metro). For locations far
from the dataset we generate deterministic demo hospitals so the emergency
feature works anywhere. Hospitals are ranked by *road ETA* (live OSRM when
reachable, else a seeded estimate) — never by raw distance alone.
"""
from __future__ import annotations

import asyncio
import hashlib
import json
from pathlib import Path

from app.config import settings
from app.models import Hospital
from app.providers.base import Point
from app.providers.routing import get_duration_min, haversine_km

_DATASET: list[dict] = json.loads(
    (Path(__file__).parent.parent / "data" / "hospitals.json").read_text(encoding="utf-8")
)

DEMO_PREFIXES = ["City General Hospital", "St. Mary's Medical Center", "Riverside Health",
                 "Mercy Hospital", "Sunrise Medical Center", "Northside Hospital"]


def _hash01(*parts: object) -> float:
    raw = "|".join(str(p) for p in parts).encode()
    return int(hashlib.md5(raw).hexdigest()[:8], 16) / 0xFFFFFFFF


class HospitalProvider:
    name = "hospitals"

    def _candidates(self, point: Point, limit: int) -> list[dict]:
        lat, lon = point
        near = [h for h in _DATASET if haversine_km((lat, lon), (h["lat"], h["lon"])) < 60]
        base = near if near else self._generate_demo(point)
        base = sorted(base, key=lambda h: haversine_km((lat, lon), (h["lat"], h["lon"])))
        return base[: max(limit, 8)]

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

        async def eta(h: dict) -> tuple[float, str]:
            return await get_duration_min((h["lat"], h["lon"]), point)

        etas = await asyncio.gather(*(eta(h) for h in candidates[:limit]))

        hospitals: list[Hospital] = []
        for h, (eta_min, eta_source) in zip(candidates[:limit], etas):
            distance = haversine_km((h["lat"], h["lon"]), point)
            hospitals.append(Hospital(
                id=h["id"],
                name=h["name"],
                address=h.get("address", ""),
                lat=h["lat"],
                lon=h["lon"],
                distance_km=round(distance, 2),
                eta_min=round(max(1.0, eta_min), 1),
                phone=h.get("phone", ""),
                source="demo" if h["id"].startswith("demo-") else "live",
                eta_source=eta_source,
            ))
        hospitals.sort(key=lambda h: (h.eta_min, h.distance_km))
        return hospitals
