"""Geocoding provider using Photon / Nominatim OpenStreetMap with Mumbai, India bias."""
from __future__ import annotations

import httpx
from pydantic import BaseModel


class GeocodeResult(BaseModel):
    name: str
    latitude: float
    longitude: float
    formattedAddress: str


class GeocodingProvider:
    """Geocoding service biased toward Mumbai, Maharashtra, India."""

    def __init__(self, timeout: float = 3.0) -> None:
        self.timeout = timeout

    async def geocode(self, query: str) -> list[GeocodeResult]:
        query_str = query.strip()
        if not query_str:
            return []

        # If user didn't explicitly specify country/city, add Mumbai context
        search_query = query_str
        if not any(k in query_str.lower() for k in ["mumbai", "maharashtra", "india", "delhi", "bangalore"]):
            search_query = f"{query_str}, Mumbai, Maharashtra, India"

        # Try Photon API first (fast, built on Nominatim, no strict rate-limiting)
        photon_results = await self._query_photon(search_query, query_str)
        if photon_results:
            return photon_results

        # Fallback to direct Nominatim API
        nominatim_results = await self._query_nominatim(search_query, query_str)
        if nominatim_results:
            return nominatim_results

        return []

    async def _query_photon(self, search_query: str, original_query: str) -> list[GeocodeResult]:
        url = "https://photon.komoot.io/api/"
        params = {
            "q": search_query,
            "lat": 19.0760,  # Mumbai center latitude
            "lon": 72.8777,  # Mumbai center longitude
            "limit": 6,
        }
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                resp = await client.get(url, params=params)
                if resp.status_code != 200:
                    return []
                data = resp.json()

            results: list[GeocodeResult] = []
            for feat in data.get("features", []):
                props = feat.get("properties", {})
                coords = feat.get("geometry", {}).get("coordinates", [])
                if len(coords) < 2:
                    continue

                lon, lat = coords[0], coords[1]
                name = props.get("name") or props.get("street") or props.get("district") or original_query
                city = props.get("city") or props.get("county") or "Mumbai"
                state = props.get("state") or "Maharashtra"
                country = props.get("country") or "India"

                parts = [p for p in [name, city, state, country] if p]
                formatted = ", ".join(parts)

                results.append(
                    GeocodeResult(
                        name=name,
                        latitude=round(lat, 6),
                        longitude=round(lon, 6),
                        formattedAddress=formatted,
                    )
                )
            return results
        except Exception:
            return []

    async def _query_nominatim(self, search_query: str, original_query: str) -> list[GeocodeResult]:
        url = "https://nominatim.openstreetmap.org/search"
        headers = {"User-Agent": "RoadSafeAI/1.0 (roadsafe@example.com)"}
        params = {
            "q": search_query,
            "format": "json",
            "addressdetails": "1",
            "countrycodes": "in",
            "limit": 6,
        }
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                resp = await client.get(url, params=params, headers=headers)
                if resp.status_code != 200:
                    return []
                data = resp.json()

            results: list[GeocodeResult] = []
            for item in data:
                lat = float(item["lat"])
                lon = float(item["lon"])
                display_name = item.get("display_name", original_query)
                name = item.get("name") or item.get("address", {}).get("suburb") or original_query

                results.append(
                    GeocodeResult(
                        name=name,
                        latitude=round(lat, 6),
                        longitude=round(lon, 6),
                        formattedAddress=display_name,
                    )
                )
            return results
        except Exception:
            return []
