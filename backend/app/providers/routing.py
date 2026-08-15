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
        result = await self.route_with_steps(start, end, with_geometry=True)
        if result is None:
            return None
        geometry, _distance, duration, _steps = result
        return geometry, duration, None

    async def duration(self, start: Point, end: Point) -> float | None:
        """Road travel time in minutes, or None when no valid route exists.
        No fabricated fallback — callers decide how to surface unavailability."""
        url = (
            f"{self._base}/route/v1/driving/{start[1]},{start[0]};{end[1]},{end[0]}"
            "?overview=false&geometries=geojson&steps=false&alternatives=false"
        )
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                resp = await client.get(url)
                resp.raise_for_status()
                data = resp.json()
            if not data.get("routes"):
                return None
            return data["routes"][0]["duration"] / 60.0
        except Exception:
            return None

    async def route_with_alternatives(
        self, start: Point, end: Point, max_routes: int = 3
    ) -> list[dict] | None:
        """Up to N real alternative routes from OSRM (alternatives=true).

        Returns a list of {"geometry", "distance_km", "duration_min",
        "source", "provider"} dicts sorted by duration (fastest first), or
        None when OSRM has no valid route at all. OSRM may return fewer than
        max_routes — callers pad with demo variants if needed.
        """
        url = (
            f"{self._base}/route/v1/driving/{start[1]},{start[0]};{end[1]},{end[0]}"
            f"?overview=full&geometries=geojson&steps=false&alternatives=true"
        )
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                resp = await client.get(url)
                resp.raise_for_status()
                data = resp.json()
            routes = data.get("routes") or []
            if not routes:
                return None
            out: list[dict] = []
            for route in routes[:max_routes]:
                coords = route["geometry"]["coordinates"]  # [[lon, lat], ...]
                geometry = [[lat, lon] for lon, lat in coords]
                if len(geometry) < 2:
                    continue
                out.append({
                    "geometry": geometry,
                    "distance_km": round(route.get("distance", 0) / 1000.0, 2),
                    "duration_min": round(route.get("duration", 0) / 60.0, 1),
                    "source": "live",
                    "provider": "osrm",
                })
            return out or None
        except Exception:
            return None

    async def route_with_steps(
        self, start: Point, end: Point, with_geometry: bool = True
    ) -> tuple[list[list[float]], float, float, list[dict]] | None:
        """Full OSRM route: (geometry, distance_km, duration_min, steps).

        Steps come straight from OSRM maneuvers (real turn instructions) —
        we never invent them. Returns None when no valid route exists.
        """
        overview = "full" if with_geometry else "false"
        url = (
            f"{self._base}/route/v1/driving/{start[1]},{start[0]};{end[1]},{end[0]}"
            f"?overview={overview}&geometries=geojson&steps=true&alternatives=false"
        )
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                resp = await client.get(url)
                resp.raise_for_status()
                data = resp.json()
            if not data.get("routes"):
                return None
            route = data["routes"][0]
            geometry: list[list[float]] = []
            if with_geometry:
                coords = route["geometry"]["coordinates"]  # [[lon, lat], ...]
                geometry = [[lat, lon] for lon, lat in coords]
            steps: list[dict] = []
            for leg in route.get("legs", []):
                for step in leg.get("steps", []):
                    name = (step.get("name") or "").strip()
                    steps.append({
                        "instruction": _instruction_for(step.get("maneuver") or {}, name),
                        "distance_m": int(round(step.get("distance") or 0)),
                        "name": name,
                    })
            distance_km = route.get("distance", 0) / 1000.0
            return geometry, distance_km, route["duration"] / 60.0, steps
        except Exception:
            return None


class DemoRoutingProvider:
    """Synthetic but deterministic route: a gently curving polyline between
    two points with a couple of turn-like deviations. Looks like a real road
    route on the map without needing any API. `variant` shifts the curve so
    alternative-looking demo routes can be generated for the same endpoints."""

    name = "demo"

    def __init__(self, variant: int = 0) -> None:
        self.variant = variant

    async def route(self, start: Point, end: Point) -> list[list[float]]:
        lat1, lon1 = start
        lat2, lon2 = end
        v = self.variant

        total_km = haversine_km(start, end)
        n = max(14, min(80, int(total_km / 0.22)))

        bearing = math.atan2(
            (lon2 - lon1) * math.cos(math.radians((lat1 + lat2) / 2)),
            lat2 - lat1,
        )
        perp = bearing + math.pi / 2
        amplitude = max(0.0006, min(0.006, total_km * (0.0009 + v * 0.00022)))
        # different curve phases / frequencies per variant
        freq = 2.4 + v * 0.8
        phase = v * 1.9
        humps = 1.0 + v

        pts: list[list[float]] = []
        for i in range(n + 1):
            t = i / n
            lat = lat1 + (lat2 - lat1) * t
            lon = lon1 + (lon2 - lon1) * t
            # curve: smooth sine hump + a couple of alternating deviations
            turn = math.sin(math.pi * t * freq + phase)
            hump = math.sin(math.pi * t * humps)
            direction = 1.0 if _hash01("dir", i // 6, v, start, end) < 0.5 else -1.0
            offset = direction * amplitude * hump * (0.55 + 0.45 * turn)
            lat += offset * math.sin(perp)
            lon += offset * math.cos(perp)
            # organic micro-jitter
            lat += (_hash01("jlat", i, v, start, end) - 0.5) * 0.0004
            lon += (_hash01("jlon", i, v, start, end) - 0.5) * 0.0004
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


_TURN_MODIFIERS = {
    "left": "Turn left",
    "right": "Turn right",
    "sharp left": "Turn sharp left",
    "sharp right": "Turn sharp right",
    "slight left": "Merge slightly left",
    "slight right": "Merge slightly right",
    "straight": "Continue straight",
    "uturn": "Make a U-turn",
}


def _instruction_for(maneuver: dict, name: str) -> str:
    """Build a human-readable instruction from a real OSRM maneuver.
    Falls back to a generic continuation — never invents a turn."""
    mtype = maneuver.get("type", "")
    modifier = maneuver.get("modifier", "")
    turn = _TURN_MODIFIERS.get(modifier, "")
    onto = f" onto {name}" if name else ""
    if mtype == "depart":
        if modifier:
            return f"Head {modifier}"
        bearing_after = maneuver.get("bearing_after")
        if bearing_after is not None:
            return f"Head {_direction_name(float(bearing_after))}"
        return "Head to the route"
    if mtype == "arrive":
        return "Arrive at destination"
    if mtype in ("turn", "end of road"):
        return f"{turn or 'Turn'}{onto}" if turn else f"Continue{onto}"
    if mtype == "roundabout turn":
        return f"At the roundabout, {turn.lower() or 'turn'}{onto}"
    if mtype in ("roundabout", "rotary"):
        return "Enter the roundabout"
    if mtype in ("exit roundabout", "exit rotary"):
        return f"Exit the roundabout{onto}"
    if mtype in ("merge", "fork", "on ramp", "off ramp"):
        return f"{turn or 'Merge'}{onto}" if turn else f"Keep going{onto}"
    if mtype in ("new name", "continue", "notification", "use lane"):
        return f"Continue{onto}"
    return "Continue"


def _direction_name(bearing: float) -> str:
    dirs = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"]
    return dirs[int(((bearing % 360) + 22.5) // 45) % 8]


async def get_osrm_duration_min(start: Point, end: Point) -> float | None:
    """Live road travel time in minutes for ranking hospitals.

    Uses TomTom when configured (existing live hierarchy), else OSRM.
    Returns None when no live routing provider produced a valid route —
    callers must NOT substitute a fabricated ETA."""
    if settings.has_routing:
        tom = TomTomRoutingProvider()
        result = await tom.route(start, end)
        if result and result[1] is not None:
            return result[1]
    osrm = OsrmRoutingProvider()
    return await osrm.duration(start, end)


async def get_route_alternatives(start: Point, end: Point, max_alts: int = 3) -> list[dict]:
    """Real route alternatives for the ride bottom sheet (fastest first).

    Tries live routing (TomTom single route, then OSRM alternatives=true) and
    pads up to `max_alts` with deterministic demo variants so the UI always
    has a few selectable options. Each dict: {"geometry", "distance_km",
    "duration_min", "source", "provider"}.
    """
    out: list[dict] = []

    if settings.has_routing:
        tom = TomTomRoutingProvider()
        result = await tom.route(start, end)
        if result and len(result[0]) >= 2:
            geo, duration, _ = result
            out.append({
                "geometry": geo,
                "distance_km": round(polyline_length_km(geo), 2),
                "duration_min": round(duration, 1),
                "source": "live",
                "provider": "tomtom",
            })
    if not out:
        osrm = OsrmRoutingProvider()
        alt = await osrm.route_with_alternatives(start, end, max_alts)
        if alt:
            out.extend(alt)

    # Pad with deterministic demo variants until we have max_alts options.
    while len(out) < max_alts:
        demo = DemoRoutingProvider(variant=len(out))
        geo = await demo.route(start, end)
        km = polyline_length_km(geo)
        speed_kmh = max(24.0, 44.0 - len(out) * 8.0)
        out.append({
            "geometry": geo,
            "distance_km": round(km, 2),
            "duration_min": round(km / speed_kmh * 60.0, 1),
            "source": "demo",
            "provider": "demo",
        })

    out.sort(key=lambda r: r["duration_min"])
    return out[:max_alts]


async def get_emergency_route(
    start: Point, end: Point
) -> dict:
    """Full navigation route from the driver to the selected hospital.

    Returns {"source", "provider", "distance_km", "duration_min",
    "geometry", "steps"}. OSRM provides real geometry + turn-by-turn steps;
    on failure we fall back to the existing labelled DEMO route with no
    fabricated instructions (the UI shows "Follow the highlighted route")."""
    osrm = OsrmRoutingProvider()
    result = await osrm.route_with_steps(start, end, with_geometry=True)
    if result and len(result[0]) >= 2:
        geometry, distance_km, duration_min, steps = result
        return {
            "source": "live",
            "provider": "osrm",
            "distance_km": round(distance_km, 2),
            "duration_min": round(duration_min, 1),
            "geometry": geometry,
            "steps": steps,
        }
    demo = DemoRoutingProvider()
    geometry = await demo.route(start, end)
    km = polyline_length_km(geometry)
    return {
        "source": "demo",
        "provider": "demo",
        "distance_km": round(km, 2),
        "duration_min": round(km / 40.0 * 60.0, 1),
        "geometry": geometry,
        "steps": [],
    }
async def get_duration_min(start: Point, end: Point) -> tuple[float, str]:
    """Road ETA in minutes. Uses live routing when available, else a seeded estimate."""
    if settings.has_routing:
        tom = TomTomRoutingProvider()
        result = await tom.route(start, end)
        if result and result[1] is not None:
            return result[1]
    osrm = OsrmRoutingProvider()
    return await osrm.duration(start, end)


async def get_emergency_route(
    start: Point, end: Point
) -> dict:
    """Full navigation route from the driver to the selected hospital.

    Returns {"source", "provider", "distance_km", "duration_min",
    "geometry", "steps"}. OSRM provides real geometry + turn-by-turn steps;
    on failure we fall back to the existing labelled DEMO route with no
    fabricated instructions (the UI shows "Follow the highlighted route")."""
    osrm = OsrmRoutingProvider()
    result = await osrm.route_with_steps(start, end, with_geometry=True)
    if result and len(result[0]) >= 2:
        geometry, distance_km, duration_min, steps = result
        return {
            "source": "live",
            "provider": "osrm",
            "distance_km": round(distance_km, 2),
            "duration_min": round(duration_min, 1),
            "geometry": geometry,
            "steps": steps,
        }
    demo = DemoRoutingProvider()
    geometry = await demo.route(start, end)
    km = polyline_length_km(geometry)
    return {
        "source": "demo",
        "provider": "demo",
        "distance_km": round(km, 2),
        "duration_min": round(km / 40.0 * 60.0, 1),
        "geometry": geometry,
        "steps": [],
    }
