"""Provider interfaces.

Every external dependency (routing, hospitals, traffic, safety data) sits
behind a small interface so providers can be swapped without touching the UI
or the safety engine. Demo providers implement the same interfaces so the app
never depends on a third-party key being present.
"""
from __future__ import annotations

from typing import Protocol, runtime_checkable

Point = tuple[float, float]  # (lat, lon)


@runtime_checkable
class RoutingProvider(Protocol):
    """Returns a polyline of [lat, lon] points, or None if unavailable."""

    name: str

    async def route(self, start: Point, end: Point) -> list[list[float]] | None:
        ...


@runtime_checkable
class HospitalProvider(Protocol):
    """Returns candidate hospitals near a point (straight-line sorted)."""

    name: str

    async def hospitals_near(self, point: Point, limit: int) -> list[dict]:
        ...


@runtime_checkable
class TrafficProvider(Protocol):
    """Returns a 0 (gridlocked) .. 100 (free-flow) condition for a point."""

    name: str

    async def traffic_condition(self, point: Point) -> float:
        ...
