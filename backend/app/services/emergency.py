"""One-tap emergency response logic."""
from __future__ import annotations

from app.config import settings
from app.models import EmergencyResponse
from app.providers.base import Point
from app.providers.hospitals import HospitalProvider

_hospitals = HospitalProvider()


def emergency_number_for(point: Point) -> tuple[str, str]:
    """Region-aware emergency number based on coarse coordinates."""
    lat, lon = point
    if -130 <= lon <= -52 and 18 <= lat <= 72:      # US / Canada / Mexico
        return "911", "US / Canada"
    if -12 <= lon <= 4 and 49 <= lat <= 62:         # UK / Ireland
        return "999", "United Kingdom"
    if -32 <= lon <= 60 and 34 <= lat <= 72:        # continental Europe
        return "112", "Europe"
    if 112 <= lon <= 155 and -45 <= lat <= -10:     # Australia
        return "000", "Australia"
    return "911", "United States"


def map_link_for(point: Point) -> str:
    lat, lon = point
    return f"https://www.openstreetmap.org/?mlat={lat:.5f}&mlon={lon:.5f}#map=16/{lat:.5f}/{lon:.5f}"


async def activate_emergency(point: Point, radius_km: float | None = None) -> EmergencyResponse:
    number, region = emergency_number_for(point)
    radius = radius_km or settings.hospital_search_radius_km
    hospitals = await _hospitals.hospitals_near(point, radius_km=radius)
    lat, lon = point
    return EmergencyResponse(
        emergency_number=number,
        region=region,
        message=(
            f"Emergency detected near {lat:.4f}, {lon:.4f}. "
            f"Dial {number} or tap to call the nearest hospital."
        ),
        map_link=map_link_for(point),
        countdown_seconds=settings.emergency_countdown_seconds,
        hospitals=hospitals,
        search_radius_km=radius,
        hospitals_source="overpass",
    )
