"""Routing providers: OSRM (live, no key required) + deterministic demo fallback."""
from __future__ import annotations

import asyncio
import hashlib
import math

import httpx

from app.config import settings
from app.providers.base import Point
from app.providers.traffic import traffic_condition_from_routing


def _hash01(*parts: object) -> float:
    raw = "|".join(str(p) for p in parts).encode()
    return int(hashlib.md5(raw).hexdigest()[:8], 16) / 0xFFFFFFFF


class TomTomRoutingProvider:
    """Live routing via the TomTom Routing API (traffic-aware).
    Used when ROUTING_API_KEY is configured; otherwise OSRM/demo."""

    name = "tomtom"

    def __init__(self) -> None:
        self._key = settings.routing_api_key
        self._timeout = settings.tomtom_timeout

    async def route(self, start: Point, end: Point) -> tuple[list[list[float]], float, float | None] | None:
        """Returns (geometry, duration_min, traffic_condition_0_100) or None.
        Traffic comes from the routing response's own delay — no extra calls."""
        url = (
            f"{settings.tomtom_url}/routing/1/calculateRoute/"
            f"{start[0]},{start[1]}:{end[0]},{end[1]}/json"
            f"?key={self._key}&traffic=true&routeType=fastest&computeTravelTimeFor=all"
        )
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                resp = await client.get(url)
                resp.raise_for_status()
                data = resp.json()
            route = data["routes"][0]
            pts: list[list[float]] = []
            for leg in route["legs"]:
                for p in leg["points"]:
                    pts.append([p["latitude"], p["longitude"]])
            if len(pts) < 2:
                return None
            summary = route["summary"]
            duration = summary["travelTimeInSeconds"] / 60.0
            traffic = traffic_condition_from_routing(
                summary["travelTimeInSeconds"], summary.get("trafficLengthInSeconds", 0))
            return pts, duration, traffic
        except Exception:
            return None


class OsrmRoutingProvider:
    name = "osrm"

    def __init__(self) -> None:
        self._base = settings.osrm_url
        self._timeout = settings.osrm_timeout

    async def route(self, start: Point, end: Point) -> tuple[list[list[float]], float, float | None] | None:
        """Returns (geometry, duration_min, traffic) or None (no traffic info)."""
        url = (
            f"{self._base}/route/v1/driving/{start[1]},{start[0]};{end[1]},{end[0]}"
            "?overview=full&geometries=geojson&steps=false&alternatives=false"
        )
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                resp = await client.get(url)
                resp.raise_for_status()
                data = resp.json()
            route = data["routes"][0]
            coords = route["geometry"]["coordinates"]  # [[lon, lat], ...]
            geometry = [[lat, lon] for lon, lat in coords]
            return geometry, route["duration"] / 60.0, None
        except Exception:
            return None


class DemoRoutingProvider:
    """Synthetic but deterministic route: a gently curving polyline between
    two points with a couple of turn-like deviations. Looks like a real road
    route on the map without needing any API."""

    name = "demo"

    async def route(self, start: Point, end: Point) -> list[list[float]]:
        lat1, lon1 = start
        lat2, lon2 = end

        total_km = haversine_km(start, end)
        n = max(14, min(80, int(total_km / 0.22)))

        bearing = math.atan2(
            (lon2 - lon1) * math.cos(math.radians((lat1 + lat2) / 2)),
            lat2 - lat1,
        )
        perp = bearing + math.pi / 2
        amplitude = max(0.0006, min(0.006, total_km * 0.0009))

        pts: list[list[float]] = []
        for i in range(n + 1):
            t = i / n
            lat = lat1 + (lat2 - lat1) * t
            lon = lon1 + (lon2 - lon1) * t
            # curve: smooth sine hump + a couple of alternating deviations
            turn = math.sin(math.pi * t * 2.4)
            hump = math.sin(math.pi * t)
            direction = 1.0 if _hash01("dir", i // 6, start, end) < 0.5 else -1.0
            offset = direction * amplitude * hump * (0.55 + 0.45 * turn)
            lat += offset * math.sin(perp)
            lon += offset * math.cos(perp)
            # organic micro-jitter
            lat += (_hash01("jlat", i, start, end) - 0.5) * 0.0004
            lon += (_hash01("jlon", i, start, end) - 0.5) * 0.0004
            pts.append([round(lat, 6), round(lon, 6)])
        return pts


def haversine_km(a: Point, b: Point) -> float:
    R = 6371.0
    la1, lo1 = math.radians(a[0]), math.radians(a[1])
    la2, lo2 = math.radians(b[0]), math.radians(b[1])
    dla, dlo = la2 - la1, lo2 - lo1
    h = math.sin(dla / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin(dlo / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h))


def polyline_length_km(pts: list[list[float]]) -> float:
    return sum(haversine_km((pts[i][0], pts[i][1]), (pts[i + 1][0], pts[i + 1][1]))
               for i in range(len(pts) - 1))


async def get_route(start: Point, end: Point) -> tuple[list[list[float]], float, str, str, float | None]:
    """Try live routing (TomTom when keyed, else OSRM), then the deterministic
    demo route. Returns (geometry, duration_min, source, provider, traffic)."""
    if settings.has_routing:
        tom = TomTomRoutingProvider()
        result = await tom.route(start, end)
        if result and len(result[0]) >= 2:
            geo, duration, traffic = result
            return geo, duration, "live", "tomtom", traffic
    osrm = OsrmRoutingProvider()
    result = await osrm.route(start, end)
    if result and len(result[0]) >= 2:
        geo, duration, _ = result
        return geo, duration, "live", "osrm", None
    demo = DemoRoutingProvider()
    geo = await demo.route(start, end)
    km = polyline_length_km(geo)
    return geo, km / 40.0 * 60.0, "demo", "demo", None


async def get_duration_min(start: Point, end: Point) -> tuple[float, str]:
    """Road ETA in minutes. Uses live routing when available, else a seeded estimate."""
    if settings.has_routing:
        tom = TomTomRoutingProvider()
        result = await tom.route(start, end)
        if result:
            return result[1], "live"
    osrm = OsrmRoutingProvider()
    result = await osrm.route(start, end)
    if result:
        return result[1], "live"
    km = haversine_km(start, end)
    speed = 38.0 + (_hash01("spd", start, end) - 0.5) * 10.0
    return km / speed * 60.0, "estimated"
