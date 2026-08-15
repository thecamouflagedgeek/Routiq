"""The safety scoring engine.

Every segment gets a 0-100 score from five explainable factors:

    hazards      (real user reports + real dataset records near the segment)
    lighting     (no lighting data exists in the datasets -> neutral baseline)
    accidents    (REAL Mumbai risk datasets: high-risk corridors, blackspot
                  junctions, pedestrian hit-and-run blackspots)
    road_quality (no surface data exists in the datasets -> neutral baseline)
    traffic      (live TomTom flow when keyed, disclosed estimate otherwise)

The ``accidents`` factor is driven entirely by the real CSV datasets loaded
by RiskDataService — the old hash-based "accident-history density layer" is
gone. Factors with no dataset coverage (lighting, road surface) use an honest
neutral baseline instead of fabricated reasons; user-submitted hazards are
real data and still adjust their factors. Demo hazards are excluded from the
scoring path. 100 = safest, 0 = highest risk.
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
from app.models import FactorExplanation, Hazard, RiskLocationMatch, Segment
from app.providers.base import Point
from app.providers.hazards import HazardService
from app.providers.traffic import DemoTrafficProvider, blend_route_traffic
from app.providers.weather import weather_modifiers
from app.services.risk_data import (
    HIGH_RISK_CORRIDOR,
    RiskDataService,
    RiskMatch,
)

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

# Neutral baseline for factors the real datasets carry no information about.
# "No data" is treated as neither safe nor unsafe, so the score is dominated
# by real evidence rather than fabricated reasons.
NEUTRAL_BASELINE = 75.0

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


def _clamp(value: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, value))


class SafetyEngine:
    def __init__(self, weights: SafetyWeights | None = None,
                 risk_data: RiskDataService | None = None):
        self.weights = weights or settings.safety_weights
        self.hazards = HazardService()
        self.traffic = DemoTrafficProvider()
        self.risk_data = risk_data or RiskDataService()

    # ------------------------------------------------------------------ API
    async def score_route_async(self, geometry: list[list[float]],
                                segments_geo: list[list[list[float]]],
                                weights: SafetyWeights | None = None,
                                weather: dict | None = None,
                                route_traffic: float | None = None) -> list[Segment]:
        w = weights or self.weights
        midpoints = [_midpoint(seg) for seg in segments_geo]
        traffic_live = route_traffic is not None
        if traffic_live:
            # live route-level baseline + deterministic per-segment variation
            traffic_values = [blend_route_traffic(route_traffic, m) for m in midpoints]
        else:
            traffic_values = [await self.traffic.traffic_condition(m) for m in midpoints]
        out: list[Segment] = []
        for idx, seg in enumerate(segments_geo):
            out.append(await self.score_segment(
                idx, seg, w, traffic=traffic_values[idx],
                weather=weather, traffic_live=traffic_live))
        return out

    # ------------------------------------------------------------- one segment
    async def score_segment(self, idx: int, geometry: list[list[float]],
                            weights: SafetyWeights | None = None,
                            traffic: float | None = None,
                            weather: dict | None = None,
                            traffic_live: bool = False) -> Segment:
        w = weights or self.weights
        mid = _midpoint(geometry)
        radius = settings.hazard_radius_m

        # -- REAL dataset evidence (only applies inside Greater Mumbai) --------
        matches = self.risk_data.near_segment(geometry, settings.risk_match_radius_m)
        dataset_hazards = self.risk_data.matches_as_hazards(matches)
        user_hazards = [h for h in self.hazards.hazards_near_segment(mid, radius)
                        if h.source == "user"]
        hazards = dataset_hazards + user_hazards
        wx = weather_modifiers(weather)

        # -- factor: hazards --------------------------------------------------
        hazard_score = max(0.0, 100.0 - _hazard_penalty(hazards))
        # -- factor: lighting ---------------------------------------------------
        # The datasets contain no lighting data -> honest neutral baseline.
        # User-reported poor lighting and real weather (night/rain) still apply.
        lighting = NEUTRAL_BASELINE
        if any(h.type == "poor_lighting" for h in user_hazards):
            lighting -= 28
        lighting -= wx["lighting"]
        lighting = _clamp(lighting)
        # -- factor: accidents (REAL dataset-driven) ----------------------------
        accidents = 100.0 - self.risk_data.segment_penalty(matches)
        if any(h.type == "accident" for h in user_hazards):
            accidents -= 22
        accidents = _clamp(accidents)
        # -- factor: road quality ------------------------------------------------
        # The datasets contain no surface data -> honest neutral baseline.
        # User-reported potholes and real weather still apply.
        quality = NEUTRAL_BASELINE
        potholes = [h for h in user_hazards if h.type == "pothole"]
        if potholes:
            quality -= min(40.0, len(potholes) * 14 + _hazard_penalty(potholes) * 0.3)
        quality -= wx["road_quality"]
        quality = _clamp(quality)
        # -- factor: traffic ------------------------------------------------------
        if traffic is None:
            traffic = await self.traffic.traffic_condition(mid)
        traffic -= wx["traffic"]
        traffic = _clamp(traffic)

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

        explanation = self._explain(factors, hazards, w, matches, traffic_live)
        name = self._name(idx, mid, matches)
        risk_locations = [self._match_model(m) for m in matches]

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
            risk_locations=risk_locations,
        )

    @staticmethod
    def _match_model(m: RiskMatch) -> RiskLocationMatch:
        loc = m.location
        return RiskLocationMatch(
            id=loc.id,
            source=loc.source,
            type=loc.type,
            name=loc.name,
            latitude=loc.latitude or 0.0,
            longitude=loc.longitude or 0.0,
            distance_m=m.distance_m,
            risk_score=loc.risk_score,
            risk_level=loc.risk_level,
            accident_count=loc.accident_count,
            period=loc.period,
            detail=loc.detail,
        )

    # ------------------------------------------------------------- explanation
    def _explain(self, factors: dict[str, float], hazards: list[Hazard],
                 w: SafetyWeights, matches: list[RiskMatch],
                 traffic_live: bool) -> list[FactorExplanation]:
        labels = {
            "hazards": "Reported hazards",
            "lighting": "Lighting conditions",
            "accidents": "Accident history",
            "road_quality": "Road surface quality",
            "traffic": "Traffic / braking conditions",
        }
        dataset_summary = self.risk_data.summary(matches, settings.risk_match_radius_m)
        user_accident = any(h.type == "accident" for h in hazards if h.source == "user")
        details = {
            "hazards": lambda: self._hazard_detail(hazards),
            "lighting": lambda: ("Poor lighting reported by a user nearby" if any(
                h.type == "poor_lighting" and h.source == "user" for h in hazards)
                else "No lighting data in source datasets — treated as neutral"),
            "accidents": lambda: (
                ("User-reported accident nearby; " if user_accident else "") + dataset_summary),
            "road_quality": lambda: ("Potholes reported by users on this segment" if any(
                h.type == "pothole" and h.source == "user" for h in hazards)
                else "No road surface data in source datasets — treated as neutral"),
            "traffic": lambda: self._traffic_detail(factors["traffic"], traffic_live),
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
    def _traffic_detail(traffic_score: float, traffic_live: bool) -> str:
        if not traffic_live:
            return "Traffic estimated from typical conditions (no live feed)"
        if traffic_score >= 80:
            flow = "Light traffic flow"
        elif traffic_score >= 55:
            flow = "Moderate traffic flow"
        else:
            flow = "Heavy traffic flow"
        return f"{flow} (live routing data)"

    @staticmethod
    def _hazard_detail(hazards: list[Hazard]) -> str:
        if not hazards:
            return "No hazards reported on this segment"
        names = sorted({h.description for h in hazards[:2]})
        extra = " + more" if len(hazards) > 2 else ""
        return ", ".join(names) + extra

    # ------------------------------------------------------------------ misc
    @staticmethod
    def _length_km(geometry: list[list[float]]) -> float:
        from app.providers.routing import polyline_length_km
        return polyline_length_km(geometry)

    @staticmethod
    def _name(idx: int, mid: Point, matches: list[RiskMatch]) -> str:
        letter = chr(65 + (idx % 26))
        # When the segment passes a real corridor, use its real road name.
        for m in matches:
            if m.location.source == HIGH_RISK_CORRIDOR:
                return f"Segment {letter} · {m.location.name}"
        street = STREET_NAMES[int(_hash01("street", mid[0], mid[1]) * len(STREET_NAMES))]
        return f"Segment {letter} · {street}"


def overall_score(segments: list[Segment]) -> tuple[float, str, str]:
    """Distance-weighted route score so long segments matter more."""
    total_km = sum(s.distance_km for s in segments) or 1.0
    score = sum(s.safety_score * s.distance_km for s in segments) / total_km
    return round(score, 0), risk_level_for(score), risk_color_for(score)
