"""Traffic conditions for the safety engine.

Live traffic comes from the TomTom routing response itself
(``summary.trafficLengthInSeconds`` — the delay caused by congestion), so we
never spend extra API calls or hit the free tier's ~1 req/s burst limit.
That live route-level condition is blended with a deterministic per-segment
variation layer. Without a key, the demo layer stands alone.

Values are 0 (gridlocked) .. 100 (free flow).
"""
from __future__ import annotations

import hashlib
from datetime import datetime, timezone

from app.providers.base import Point


def _hash01(*parts: object) -> float:
    raw = "|".join(str(p) for p in parts).encode()
    return int(hashlib.md5(raw).hexdigest()[:8], 16) / 0xFFFFFFFF


def traffic_condition_from_routing(travel_time_s: float, traffic_delay_s: float) -> float | None:
    """0-100 free-flow condition derived from routing traffic delay."""
    if traffic_delay_s is None or traffic_delay_s <= 0 or travel_time_s <= traffic_delay_s:
        return None
    free = travel_time_s - traffic_delay_s
    ratio = traffic_delay_s / free
    condition = 100.0 - ratio * 140.0  # +25% delay -> ~65, +50% -> ~30
    return max(8.0, min(100.0, condition))


def blend_route_traffic(route_condition: float, point: Point) -> float:
    """Per-segment traffic: live route baseline + deterministic local variation."""
    lat, lon = point
    grid = (round(lat * 16) / 16, round(lon * 16) / 16)
    variation = 20 + _hash01("traffic", grid[0], grid[1]) * 30  # -15..+15 around baseline
    return max(5.0, min(100.0, 0.55 * route_condition + 0.45 * variation))


class DemoTrafficProvider:
    name = "demo-traffic"

    async def traffic_condition(self, point: Point) -> float:
        lat, lon = point
        grid = (round(lat * 16) / 16, round(lon * 16) / 16)
        base = 45 + _hash01("traffic", grid[0], grid[1]) * 45  # 45..90

        hour = datetime.now(timezone.utc).hour
        # crude rush-hour penalty, most impactful on weekdays
        if 15 <= hour <= 19:
            base -= 18
        elif 7 <= hour <= 9:
            base -= 14
        elif 22 <= hour or hour <= 5:
            base += 6

        # downtown density penalty (city centers have more congestion)
        density = abs(lat - grid[0]) + abs(lon - grid[1])
        base -= density * 12
        return max(0.0, min(100.0, base))
