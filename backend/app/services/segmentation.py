"""Split a route polyline into individual road segments.

Segmentation is distance-based with a target length, clamped to a sane
segment count so the map stays readable. Every segment keeps its own
geometry so the map can color them independently.
"""
from __future__ import annotations

from app.config import settings
from app.providers.routing import haversine_km, polyline_length_km


def segment_route(geometry: list[list[float]]) -> list[list[list[float]]]:
    """Returns a list of segments, each a list of [lat, lon] points."""
    if len(geometry) < 2:
        return [geometry]

    total_km = polyline_length_km(geometry)
    target_m = settings.segment_target_meters
    max_seg = settings.max_segments
    min_seg = settings.min_segments

    # adapt target so we land within [min_seg, max_seg] segments
    if total_km == 0:
        return [geometry]
    natural = max(1, int(total_km * 1000 / target_m))
    n = max(min_seg, min(max_seg, natural))
    target_m = total_km * 1000 / n

    segments: list[list[list[float]]] = []
    current: list[list[float]] = [geometry[0]]
    acc = 0.0

    for i in range(1, len(geometry)):
        prev, cur = geometry[i - 1], geometry[i]
        step = haversine_km((prev[0], prev[1]), (cur[0], cur[1])) * 1000
        if acc + step >= target_m and current and len(segments) < n - 1:
            # subdivide the step so the break lands close to target length
            frac = max(0.0, min(1.0, (target_m - acc) / step if step else 0))
            if 0 < frac < 1:
                mid = [
                    prev[0] + (cur[0] - prev[0]) * frac,
                    prev[1] + (cur[1] - prev[1]) * frac,
                ]
                current.append(mid)
                segments.append(current)
                current = [mid, cur]
                acc = step * (1 - frac)
            else:
                segments.append(current)
                current = [cur]
                acc = 0.0
        else:
            current.append(cur)
            acc += step

    if current and len(current) > 1:
        segments.append(current)
    return segments
