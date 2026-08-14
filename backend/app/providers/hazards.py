"""Hazard data: deterministic demo hazards (generated, never random per
refresh) merged with user-submitted hazards persisted to disk."""
from __future__ import annotations

import hashlib
import math
import uuid
from typing import Optional

from app.config import settings
from app.models import Hazard, HazardIn, HAZARD_LABELS
from app.providers.base import Point
from app.providers.routing import haversine_km
from app.storage import JsonStore

HAZARD_TYPES = [
    "pothole", "poor_lighting", "dangerous_intersection", "construction",
    "accident", "road_blockage", "flooding",
]
TYPE_WEIGHTS = [0.26, 0.16, 0.16, 0.13, 0.12, 0.09, 0.08]

SEVERITIES = ["high", "medium", "low"]
SEVERITY_WEIGHTS = [0.30, 0.45, 0.25]

CELL_DEG = 0.015  # ~1.7 km cells -> stable hazard "field" everywhere


def _hash01(*parts: object) -> float:
    raw = "|".join(str(p) for p in parts).encode()
    return int(hashlib.md5(raw).hexdigest()[:8], 16) / 0xFFFFFFFF


def _pick(choices: list[str], weights: list[float], r: float) -> str:
    total = sum(weights)
    acc = 0.0
    for choice, w in zip(choices, weights):
        acc += w
        if r * total <= acc:
            return choice
    return choices[-1]


class HazardService:
    def __init__(self, store_path: str | None = None):
        path = store_path or f"{settings.data_dir}/hazards.json"
        self._store = JsonStore(path, [])

    # ------------------------------------------------------------------ demo
    def _cell_hazards(self, ci: int, cj: int) -> list[Hazard]:
        """Deterministic demo hazards for one grid cell (1-4 per cell)."""
        r = _hash01("cnt", ci, cj)
        n = 4 if r < 0.30 else 3 if r < 0.55 else 2 if r < 0.80 else 1
        out: list[Hazard] = []
        for k in range(n):
            htype = _pick(HAZARD_TYPES, TYPE_WEIGHTS, _hash01("ty", ci, cj, k))
            sev = _pick(SEVERITIES, SEVERITY_WEIGHTS, _hash01("sv", ci, cj, k))
            lat = ci * CELL_DEG + 0.003 + _hash01("lat", ci, cj, k) * (CELL_DEG - 0.006)
            lon = cj * CELL_DEG + 0.003 + _hash01("lon", ci, cj, k) * (CELL_DEG - 0.006)
            label = HAZARD_LABELS[htype]
            out.append(Hazard(
                id=f"demo-{ci}-{cj}-{k}",
                type=htype,
                severity=sev,
                lat=round(lat, 6),
                lon=round(lon, 6),
                description=f"{label} (demo data)",
                source="demo",
                reported_at="demo",
            ))
        return out

    def demo_hazards_near(self, center: Point, radius_m: float, limit: int = 60) -> list[Hazard]:
        lat0, lon0 = center
        ci0, cj0 = int(lat0 / CELL_DEG), int(lon0 / CELL_DEG)
        cells = int(math.ceil(radius_m / 111000.0 / CELL_DEG)) + 1
        found: list[Hazard] = []
        for di in range(-cells, cells + 1):
            for dj in range(-cells, cells + 1):
                for hz in self._cell_hazards(ci0 + di, cj0 + dj):
                    d = haversine_km(center, (hz.lat, hz.lon)) * 1000
                    if d <= radius_m:
                        hz.distance_m = round(d, 0)
                        found.append(hz)
        found.sort(key=lambda h: h.distance_m or 0)
        return found[:limit]

    # ------------------------------------------------------------------ store
    def user_hazards(self) -> list[Hazard]:
        return [Hazard(**h) for h in self._store.get()]

    def all_hazards(self, center: Point, radius_m: Optional[float] = None,
                    limit: int = 60) -> list[Hazard]:
        user = self.user_hazards()
        if radius_m:
            for h in user:
                h.distance_m = round(haversine_km(center, (h.lat, h.lon)) * 1000, 0)
            user = [h for h in user if (h.distance_m or 0) <= radius_m]
        demo = self.demo_hazards_near(center, radius_m or settings.hazard_radius_m, limit)
        merged = user + demo
        merged.sort(key=lambda h: h.distance_m if h.distance_m is not None else 1e9)
        return merged[:limit]

    def create(self, hazard: HazardIn) -> Hazard:
        new = Hazard(
            id=f"u-{uuid.uuid4().hex[:10]}",
            type=hazard.type,
            severity=hazard.severity,
            lat=hazard.lat,
            lon=hazard.lon,
            description=hazard.description or HAZARD_LABELS[hazard.type],
            source="user",
        )
        items = self._store.get()
        items.append(new.model_dump())
        self._store.set(items)
        return new

    def hazards_near_segment(self, midpoint: Point, radius_m: float) -> list[Hazard]:
        return self.all_hazards(midpoint, radius_m, limit=8)
