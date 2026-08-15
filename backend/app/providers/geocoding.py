"""Geocoding provider using Mappls (MapmyIndia) REST API with fallback to Photon / Nominatim."""
from __future__ import annotations

import httpx
from pydantic import BaseModel
from app.config import settings


class GeocodeResult(BaseModel):
    name: str
    latitude: float
    longitude: float
    formattedAddress: str


class GeocodingProvider:
    """Universal hyper-accurate geocoding service using Mappls (MapmyIndia) API with fallback to Photon & Nominatim."""

    def __init__(self, timeout: float = 4.0) -> None:
        self.timeout = timeout

    async def geocode(self, query: str) -> list[GeocodeResult]:
        query_str = query.strip()
        if not query_str:
            return []

        # 1. Primary: Mappls (MapmyIndia) Search API
        if settings.mappls_api_key:
            mappls_results = await self._query_mappls(query_str)
            if mappls_results:
                return mappls_results

        # 2. Photon API
        photon_results = await self._query_photon(query_str, query_str)
        if photon_results:
            return photon_results

        # 3. Direct Nominatim API
        nominatim_results = await self._query_nominatim(query_str, query_str)
        if nominatim_results:
            return nominatim_results

        # 4. Fallback with Mumbai context
        fallback_query = f"{query_str}, Mumbai, India"
        return await self._query_photon(fallback_query, query_str)

    async def _query_mappls(self, query: str) -> list[GeocodeResult]:
        headers = {"Authorization": f"Bearer {settings.mappls_api_key}"}
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                # 1. Mappls Atlas Places Search API
                resp = await client.get(
                    "https://atlas.mappls.com/api/places/search/json",
                    params={"query": query},
                    headers=headers,
                )
                if resp.status_code == 200:
                    data = resp.json()
                    results: list[GeocodeResult] = []
                    for item in data.get("suggestedLocations", []):
                        name = item.get("placeName") or query
                        addr = item.get("placeAddress") or name
                        lat = item.get("latitude")
                        lon = item.get("longitude")
                        if lat is not None and lon is not None:
                            try:
                                results.append(
                                    GeocodeResult(
                                        name=name,
                                        latitude=round(float(lat), 6),
                                        longitude=round(float(lon), 6),
                                        formattedAddress=f"{name}, {addr}" if name not in addr else addr,
                                    )
                                )
                            except (ValueError, TypeError):
                                continue
                    if results:
                        return results

                # 2. Mappls Outpost Geocode API
                resp2 = await client.get(
                    "https://outpost.mappls.com/api/places/geocode",
                    params={"address": query},
                    headers=headers,
                )
                if resp2.status_code == 200:
                    data2 = resp2.json()
                    results2: list[GeocodeResult] = []
                    for item in data2.get("copResults", []):
                        name = item.get("houseName") or item.get("street") or item.get("locality") or query
                        formatted = item.get("formattedAddress", query)
                        lat = item.get("latitude")
                        lon = item.get("longitude")
                        if lat and lon:
                            try:
                                results2.append(
                                    GeocodeResult(
                                        name=name,
                                        latitude=round(float(lat), 6),
                                        longitude=round(float(lon), 6),
                                        formattedAddress=formatted,
                                    )
                                )
                            except (ValueError, TypeError):
                                continue
                    if results2:
                        return results2
        except Exception as e:
            print(f"[Mappls Geocode Exception] {e}")
        return []

    async def _query_photon(self, search_query: str, original_query: str) -> list[GeocodeResult]:
        url = "https://photon.komoot.io/api/"
        params = {
            "q": search_query,
            "lat": 19.0760,
            "lon": 72.8777,
            "limit": 10,
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
                name = props.get("name") or props.get("street") or props.get("district") or props.get("city") or original_query
                city = props.get("city") or props.get("district") or props.get("county") or ""
                state = props.get("state") or ""
                country = props.get("country") or ""

                parts = [p for p in [name, city, state, country] if p and p != name]
                formatted = f"{name}, {', '.join(parts)}" if parts else name

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
            "limit": 10,
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
                addr = item.get("address", {})
                name = item.get("name") or addr.get("amenity") or addr.get("suburb") or addr.get("road") or original_query

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

    async def reverse_geocode(self, lat: float, lon: float) -> GeocodeResult:
        url = "https://nominatim.openstreetmap.org/reverse"
        headers = {"User-Agent": "RoadSafeAI/1.0 (roadsafe@example.com)"}
        params = {"lat": lat, "lon": lon, "format": "json"}
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                resp = await client.get(url, params=params, headers=headers)
                if resp.status_code == 200:
                    data = resp.json()
                    display_name = data.get("display_name", f"{lat:.4f}, {lon:.4f}")
                    addr = data.get("address", {})
                    name = addr.get("amenity") or addr.get("suburb") or addr.get("neighbourhood") or addr.get("road") or data.get("name") or "Selected Location"
                    return GeocodeResult(
                        name=name,
                        latitude=round(lat, 6),
                        longitude=round(lon, 6),
                        formattedAddress=display_name,
                    )
        except Exception:
            pass
        return GeocodeResult(
            name=f"{lat:.4f}, {lon:.4f}",
            latitude=round(lat, 6),
            longitude=round(lon, 6),
            formattedAddress=f"{lat:.4f}, {lon:.4f}, Mumbai, India",
        )
