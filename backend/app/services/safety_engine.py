"""The safety scoring engine.

Every segment gets a 0-100 score from five explainable factors:

    hazards      (reported/demo hazards near the segment)
    lighting     (lighting conditions, incl. 'poor lighting' hazards)
    accidents    (accident-history density layer)
    road_quality (surface condition, incl. pothole hazards)
    traffic      (congestion / braking conditions)

All spatial "layers" are deterministic functions of the segment's grid cell,
so a refresh never produces a different score for the same road. User-
submitted hazards change scores — that is real data and should.
"""
from __future__ import annotations

import hashlib

from app.config import (
    RECOMMENDATIONS,
    SafetyWeights,
    settings,
    risk_color_for,
    risk_level_for,
)
from app.models import FactorExplanation, Hazard, Segment
from app.providers.base import Point
from app.providers.hazards import HazardService
from app.providers.traffic import DemoTrafficProvider, blend_route_traffic
from app.providers.weather import weather_modifiers

SEVERITY_PENALTY = {"low": 10, "medium": 18, "high": 34}
TYPE_PENALTY = {
    "pothole": 1.2,
    "poor_lighting": 0.8,
    "accident": 1.6,
    "road_blockage": 1.7,
    "construction": 0.9,
    "flooding": 1.8,
    "dangerous_intersection": 1.2,
}

STREET_NAMES = [
    "Lincoln Ave", "Market St", "Riverside Dr", "Oakwood Blvd", "Cedar Ln",
    "Parkway Dr", "Sunset Rd", "Harbor St", "Maple Ave", "Elm St",
    "Grand Ave", "Lakeview Rd", "Union St", "Central Blvd", "Hillcrest Dr",
    "Broadway", "Main St", "Coast Hwy", "Meadow Ln", "Skyline Rd",
]


def _hash01(*parts: object) -> float:
    raw = "|".join(str(p) for p in parts).encode()
    return int(hashlib.md5(raw).hexdigest()[:8], 16) / 0xFFFFFFFF


def _midpoint(geometry: list[list[float]]) -> Point:
    n = len(geometry)
    return (geometry[n // 2][0], geometry[n // 2][1])


def _grid_cell(point: Point, scale: float) -> tuple[float, float]:
    return (round(point[0] * scale) / scale, round(point[1] * scale) / scale)


def _hazard_penalty(hazards: list[Hazard]) -> float:
    total = 0.0
    for h in hazards:
        sev = SEVERITY_PENALTY.get(h.severity, 10)
        typ = TYPE_PENALTY.get(h.type, 1.0)
        proximity = 1.0
        if h.distance_m is not None:
            proximity = max(0.0, 1.0 - h.distance_m / settings.hazard_radius_m)
        total += sev * typ * (0.5 + 0.5 * proximity)
    return total


class SafetyEngine:
    def __init__(self, weights: SafetyWeights | None = None):
        self.weights = weights or settings.safety_weights
        self.hazards = HazardService()
        self.traffic = DemoTrafficProvider()

    # ------------------------------------------------------------------ API
    async def score_route_async(self, geometry: list[list[float]],
                                segments_geo: list[list[list[float]]],
                                weights: SafetyWeights | None = None,
                                weather: dict | None = None,
                                route_traffic: float | None = None) -> list[Segment]:
        w = weights or self.weights
        midpoints = [_midpoint(seg) for seg in segments_geo]
        if route_traffic is not None:
            # live route-level baseline + deterministic per-segment variation
            traffic_values = [blend_route_traffic(route_traffic, m) for m in midpoints]
        else:
            traffic_values = [await self.traffic.traffic_condition(m) for m in midpoints]
        out: list[Segment] = []
        for idx, seg in enumerate(segments_geo):
            out.append(await self.score_segment(
                idx, seg, w, traffic=traffic_values[idx], weather=weather))
        return out

    # ------------------------------------------------------------- one segment
    async def score_segment(self, idx: int, geometry: list[list[float]],
                            weights: SafetyWeights | None = None,
                            traffic: float | None = None,
                            weather: dict | None = None) -> Segment:
        w = weights or self.weights
        mid = _midpoint(geometry)
        radius = settings.hazard_radius_m

        hazards = self.hazards.hazards_near_segment(mid, radius)
        wx = weather_modifiers(weather)

        # -- factor: hazards --------------------------------------------------
        hazard_score = max(0.0, 100.0 - _hazard_penalty(hazards))
        # -- factor: lighting ---------------------------------------------------
        light_cell = _grid_cell(mid, 24.0)
        lighting = 55 + _hash01("light", light_cell[0], light_cell[1]) * 40  # 55..95
        if any(h.type == "poor_lighting" for h in hazards):
            lighting -= 28
        lighting -= wx["lighting"]
        lighting = max(0.0, min(100.0, lighting))
        # -- factor: accidents (deterministic accident-history layer) -----------
        # Bimodal: ~30% of cells are accident hotspots (10..44), ~40% are
        # low-incident safe zones (~88), the rest middling. Gives every route
        # a realistic mix of red and green corridors without randomness.
        acc_cell = _grid_cell(mid, 32.0)
        r = _hash01("acc", acc_cell[0], acc_cell[1])
        if r < 0.30:
            accidents = r * 140              # hotspot 0..42
        elif r < 0.60:
            accidents = 60 + r * 45          # 60..87
        else:
            accidents = 88                   # low-incident corridor
        if any(h.type == "accident" for h in hazards):
            accidents -= 22
        accidents = max(0.0, min(100.0, accidents))
        # -- factor: road quality ------------------------------------------------
        road_cell = _grid_cell(mid, 32.0)
        quality = 42 + _hash01("road", road_cell[0], road_cell[1]) * 50  # 42..92
        potholes = [h for h in hazards if h.type == "pothole"]
        if potholes:
            quality -= min(40.0, len(potholes) * 14 + _hazard_penalty(potholes) * 0.3)
        quality -= wx["road_quality"]
        quality = max(0.0, min(100.0, quality))
        # -- factor: traffic ------------------------------------------------------
        if traffic is None:
            traffic = await self.traffic.traffic_condition(mid)
        traffic -= wx["traffic"]
        traffic = max(0.0, min(100.0, traffic))

        factors = {
            "hazards": round(hazard_score, 1),
            "lighting": round(lighting, 1),
            "accidents": round(accidents, 1),
            "road_quality": round(quality, 1),
            "traffic": round(traffic, 1),
        }
        score = sum(factors[k] * getattr(w, k) for k in factors)
        score = round(score, 0)
        risk = risk_level_for(score)

        explanation = self._explain(factors, hazards, w)
        name = self._name(idx, mid)

        return Segment(
            id=idx,
            name=name,
            geometry=geometry,
            start=geometry[0],
            end=geometry[-1],
            distance_km=round(self._length_km(geometry), 2),
            safety_score=round(score, 0),
            risk_level=risk,
            risk_color=risk_color_for(score),
            factors=factors,
            explanation=explanation,
            recommendation=RECOMMENDATIONS[risk],
            hazards=hazards,
        )

    # ------------------------------------------------------------- explanation
    def _explain(self, factors: dict[str, float], hazards: list[Hazard],
                 w: SafetyWeights) -> list[FactorExplanation]:
        labels = {
            "hazards": "Reported hazards",
            "lighting": "Lighting conditions",
            "accidents": "Accident history",
            "road_quality": "Road surface quality",
            "traffic": "Traffic / braking conditions",
        }
        details = {
            "hazards": lambda: self._hazard_detail(hazards),
            "lighting": lambda: ("Poor lighting detected in this area" if any(
                h.type == "poor_lighting" for h in hazards)
                else "Dimly lit road at night"),
            "accidents": lambda: ("Recent accident reported nearby" if any(
                h.type == "accident" for h in hazards)
                else "Above-average accident density in this corridor"),
            "road_quality": lambda: ("High pothole density on this surface" if any(
                h.type == "pothole" for h in hazards)
                else "Worn surface, reduced traction"),
            "traffic": lambda: "Stop-and-go traffic, frequent braking",
        }

        items: list[FactorExplanation] = []
        for key in ["hazards", "lighting", "accidents", "road_quality", "traffic"]:
            score = factors[key]
            impact = round((100.0 - score) * getattr(w, key))
            items.append(FactorExplanation(
                factor=labels[key],
                score=score,
                impact=impact,
                detail=details[key](),
            ))
        items.sort(key=lambda i: -i.impact)
        # only factors that actually drag the score down are "why" items
        return [i for i in items if i.impact >= 1]

    @staticmethod
    def _hazard_detail(hazards: list[Hazard]) -> str:
        if not hazards:
            return "No recent reports on this segment"
        names = sorted({h.description for h in hazards[:2]})
        extra = " + more" if len(hazards) > 2 else ""
        return ", ".join(names) + extra

    # ------------------------------------------------------------------ misc
    @staticmethod
    def _length_km(geometry: list[list[float]]) -> float:
        from app.providers.routing import polyline_length_km
        return polyline_length_km(geometry)

    @staticmethod
    def _name(idx: int, mid: Point) -> str:
        letter = chr(65 + (idx % 26))
        street = STREET_NAMES[int(_hash01("street", mid[0], mid[1]) * len(STREET_NAMES))]
        return f"Segment {letter} · {street}"


def overall_score(segments: list[Segment]) -> tuple[float, str, str]:
    """Distance-weighted route score so long segments matter more."""
    total_km = sum(s.distance_km for s in segments) or 1.0
    score = sum(s.safety_score * s.distance_km for s in segments) / total_km
    return round(score, 0), risk_level_for(score), risk_color_for(score)
