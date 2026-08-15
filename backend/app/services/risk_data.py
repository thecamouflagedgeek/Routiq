"""Real Mumbai risk data — loaded once from CSV datasets, never hardcoded.

Three datasets (source of truth) live in ``backend/app/data``:

    mumbai_high_risk_corridors_2019-2023.csv
        High-risk road corridors. Rows carry per-km death/injury densities
        plus period totals broken down by road-user type.

    mumbai_blackspot_high_risk_junctions_2019-2023.csv
        Officially identified dangerous junctions/blackspots with period
        fatality + serious-injury totals.

    mumbai_pedestrian_hitandrun_blackspots_2020-2023.csv
        Locations with pedestrian hit-and-run fatalities.

The three detail CSVs contain **names only — no coordinates**. Coordinates
come from the fourth CSV the data team prepared:

    mumbai_all_blackspots_master_coordinates.csv

which maps every Location_Name (all three categories) to real Latitude /
Longitude values, geocoded once by the data team. The service loads that
file as the coordinate index and joins it to the detail datasets by
normalized name (100% coverage). Live geocoding is only a fallback for
names that ever appear without coordinates.

All scores are derived from real columns (normalized min-max within each
dataset, 100 = worst in that dataset). No fabricated hazards or reasons.
"""
from __future__ import annotations

import asyncio
import csv
import json
import math
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

from app.config import MUMBAI_BOUNDS, settings, risk_level_for
from app.models import Hazard
from app.providers.base import Point
from app.providers.geocoding import GeocodingProvider
from app.providers.routing import haversine_km

# Source identifiers exposed to the frontend.
HIGH_RISK_CORRIDOR = "HIGH_RISK_CORRIDOR"
BLACKSPOT_JUNCTION = "BLACKSPOT_JUNCTION"
PREDICTED_BLACKSPOT = "PREDICTED_BLACKSPOT"

SOURCE_LABELS = {
    HIGH_RISK_CORRIDOR: "High-risk corridor (2019–2023)",
    BLACKSPOT_JUNCTION: "Blackspot junction (2019–2023)",
    PREDICTED_BLACKSPOT: "Pedestrian hit-and-run blackspot (2020–2023)",
}

MASTER_COORDS_FILE = "mumbai_all_blackspots_master_coordinates.csv"
GEOCODE_CACHE_FILE = "risk_locations_geocoded.json"
GEOCODE_CONCURRENCY = 6

_NUM_RE = re.compile(r"-?\d+(?:\.\d+)?")

# Common abbreviations in the dataset names that geocoders can't resolve.
_ABBREVS = {
    r"\bEEH\b": "Eastern Express Highway",
    r"\bWEH\b": "Western Express Highway",
    r"\bJVLR\b": "Jogeshwari Vikhroli Link Road",
    r"\bSCLR\b": "Santacruz Chembur Link Road",
    r"\bLBS\b": "Lal Bahadur Shastri",
    r"\bSCL?R\b": "Santacruz Chembur Link Road",
}


def _to_float(value: object) -> Optional[float]:
    """Parse a CSV cell that may be empty, '-', or contain units."""
    if value is None:
        return None
    raw = str(value).strip().strip('"')
    if not raw or raw in ("-", "NA", "N/A", "null", "None"):
        return None
    m = _NUM_RE.search(raw.replace(",", ""))
    return float(m.group()) if m else None


@dataclass
class RiskLocation:
    """One normalized record from any of the three datasets."""

    id: str
    source: str            # HIGH_RISK_CORRIDOR / BLACKSPOT_JUNCTION / PREDICTED_BLACKSPOT
    type: str              # corridor / junction / blackspot
    name: str
    latitude: Optional[float]
    longitude: Optional[float]
    risk_score: float      # 0..100, normalized within the source dataset
    risk_level: str
    road_name: Optional[str] = None
    junction_name: Optional[str] = None
    accident_count: Optional[int] = None
    period: Optional[str] = None
    hazards: list[str] = field(default_factory=list)   # real, from dataset columns
    detail: str = ""                                   # human evidence sentence
    metadata: dict = field(default_factory=dict)       # full original CSV row


@dataclass
class RiskMatch:
    """A RiskLocation matched to a route segment."""

    location: RiskLocation
    distance_m: float
    penalty: float  # 0..100, risk_score decayed by distance


def _in_mumbai(lat: float, lon: float) -> bool:
    return (
        MUMBAI_BOUNDS["min_lat"] <= lat <= MUMBAI_BOUNDS["max_lat"]
        and MUMBAI_BOUNDS["min_lon"] <= lon <= MUMBAI_BOUNDS["max_lon"]
    )


def _min_max(values: list[float]) -> tuple[float, float]:
    lo, hi = min(values), max(values)
    return (lo, hi) if hi > lo else (lo, lo + 1.0)


class RiskDataService:
    """Loads the three Mumbai CSV datasets, normalizes them into a common
    model, resolves coordinates by geocoding (cached), and performs spatial
    lookups for route segments."""

    # ------------------------------------------------------------- dataset defs
    DATASETS = [
        {
            "file": "mumbai_high_risk_corridors_2019-2023.csv",
            "source": HIGH_RISK_CORRIDOR,
            "type": "corridor",
            "name_col": "Road_Name",
            # Severity index: per-km casualty density (real column).
            "index_cols": ["Deaths_and_Injuries_per_Km"],
            "fallback_index": ["Total", "Length_km"],
            "count_col": "Total",
        },
        {
            "file": "mumbai_blackspot_high_risk_junctions_2019-2023.csv",
            "source": BLACKSPOT_JUNCTION,
            "type": "junction",
            "name_col": "Junction_Name",
            "index_cols": ["Total"],
            "fallback_index": ["Fatalities_period", "SeriousInjuries_period"],
            "count_col": "Total",
        },
        {
            "file": "mumbai_pedestrian_hitandrun_blackspots_2020-2023.csv",
            "source": PREDICTED_BLACKSPOT,
            "type": "blackspot",
            "name_col": "Junction_Name",
            "index_cols": ["Pedestrian_HitAndRun_Fatalities_period"],
            "fallback_index": [],
            "count_col": "Pedestrian_HitAndRun_Fatalities_period",
        },
    ]

    def __init__(self, data_dir: str | None = None) -> None:
        self.data_dir = Path(data_dir or settings.data_dir)
        self.geocoder = GeocodingProvider()
        self.locations: list[RiskLocation] = []
        self._master_coords: dict[str, dict] = {}  # normalized name -> {lat, lon, matched}
        self._coords: dict[str, dict | None] = {}  # name -> {lat, lon, formatted} | None
        self._geocoded = False
        self._load_master_coords()
        self._load_datasets()
        self._load_geocode_cache()
        self._apply_coords()  # coordinates come straight from the master CSV

    # ------------------------------------------------------------- CSV loading
    def _load_datasets(self) -> None:
        locations: list[RiskLocation] = []
        for spec in self.DATASETS:
            path = self.data_dir / spec["file"]
            if not path.exists():
                # Missing dataset: fail loudly — the datasets are the source of truth.
                raise FileNotFoundError(
                    f"Risk dataset not found: {path}. "
                    f"Place the three Mumbai CSV datasets in {self.data_dir}."
                )
            with open(path, newline="", encoding="utf-8-sig") as fh:
                rows = list(csv.DictReader(fh))
            locations.extend(self._normalize_dataset(spec, rows))
        self.locations = locations
        self._sources_loaded = {spec["source"] for spec in self.DATASETS}

    def _normalize_dataset(self, spec: dict, rows: list[dict]) -> list[RiskLocation]:
        # Deduplicate: the same road/junction can appear under several report
        # years. Keep the record with the worst severity so a location is
        # represented by its strongest real evidence.
        best: dict[str, dict] = {}
        for row in rows:
            name = (row.get(spec["name_col"]) or "").strip()
            if not name:
                continue
            index = self._severity_index(spec, row)
            if index is None:
                continue
            if name not in best or index > best[name]["_index"]:
                row["_index"] = index
                best[name] = row

        chosen = list(best.values())
        lo, hi = _min_max([r["_index"] for r in chosen])
        out: list[RiskLocation] = []
        for rank, row in enumerate(chosen, start=1):
            index: float = row["_index"]
            score = round((index - lo) / (hi - lo) * 100.0, 1)
            hazards = self._hazards_from_row(spec, row)
            count = _to_float(row.get(spec["count_col"]))
            period = (row.get("Period") or "").strip() or None
            name = (row.get(spec["name_col"]) or "").strip()
            junction = name if spec["type"] in ("junction", "blackspot") else None
            road = name if spec["type"] == "corridor" else None
            detail = self._detail(spec, name, hazards, period)
            out.append(RiskLocation(
                id=f"{spec['source'].lower()}-{rank}",
                source=spec["source"],
                type=spec["type"],
                name=name,
                latitude=None,
                longitude=None,
                risk_score=score,
                risk_level=risk_level_for(100.0 - score),
                road_name=road,
                junction_name=junction,
                accident_count=int(count) if count is not None else None,
                period=period,
                hazards=hazards,
                detail=detail,
                metadata={k: v for k, v in row.items() if k != "_index"},
            ))
        return out

    @staticmethod
    def _severity_index(spec: dict, row: dict) -> Optional[float]:
        """Combine the real severity columns of one CSV row into a single value."""
        for col in spec["index_cols"]:
            val = _to_float(row.get(col))
            if val is not None and val > 0:
                return val
        # Fallback: derive density from totals / length (both real columns).
        total = _to_float(row.get("Total"))
        length = _to_float(row.get("Length_km"))
        if total is not None and length:
            return total / length
        for col in spec["fallback_index"]:
            val = _to_float(row.get(col))
            if val is not None:
                return val
        return None

    @staticmethod
    def _hazards_from_row(spec: dict, row: dict) -> list[str]:
        """Real hazard strings, built only from columns that exist in the CSV."""
        parts: list[str] = []
        for col, label in [
            ("Deaths_per_Km", "deaths per km"),
            ("SeriousInjuries_per_Km", "serious injuries per km"),
            ("Fatalities_period", "fatalities"),
            ("SeriousInjuries_period", "serious injuries"),
            ("Pedestrian_deaths", "pedestrian deaths"),
            ("Cyclist_deaths", "cyclist deaths"),
            ("Motorcycle_rider_pillion_deaths", "motorcycle rider deaths"),
            ("FourWheeler_occupant_deaths", "four-wheeler occupant deaths"),
            ("Pedestrian_HitAndRun_Fatalities_period", "pedestrian hit-and-run fatalities"),
        ]:
            val = _to_float(row.get(col))
            if val is not None and val > 0:
                num = int(val) if float(val).is_integer() else val
                parts.append(f"{num} {label}")
        return parts[:6]

    @staticmethod
    def _detail(spec: dict, name: str, hazards: list[str], period: str | None) -> str:
        counts = ", ".join(hazards[:4])
        suffix = f" ({period})" if period else ""
        if counts:
            return f"{counts}{suffix}"
        return f"Listed in {SOURCE_LABELS[spec['source']].lower()}{suffix}"

    # ------------------------------------------------- coordinates from CSV
    @staticmethod
    def _normalize_name(name: str) -> str:
        """Normalize a location name for joining the detail CSVs to the
        master coordinates file (case/punctuation-insensitive)."""
        s = (name or "").lower()
        s = re.sub(r"[.,()']", "", s)
        s = s.replace("-", " ")
        return re.sub(r"\s+", " ", s).strip()

    def _load_master_coords(self) -> None:
        path = self.data_dir / MASTER_COORDS_FILE
        if not path.exists():
            raise FileNotFoundError(
                f"Risk coordinate dataset not found: {path}. "
                f"Place {MASTER_COORDS_FILE} in {self.data_dir}."
            )
        with open(path, newline="", encoding="utf-8-sig") as fh:
            for row in csv.DictReader(fh):
                lat = _to_float(row.get("Latitude"))
                lon = _to_float(row.get("Longitude"))
                if lat is None or lon is None:
                    continue
                key = self._normalize_name(row.get("Location_Name"))
                if key not in self._master_coords:
                    self._master_coords[key] = {
                        "lat": lat,
                        "lon": lon,
                        "matched": (row.get("Geocoded_Location_Match") or "").strip(),
                        "category": (row.get("Category") or "").strip(),
                    }

    # ------------------------------------------------------- geocoding (once)
    def _load_geocode_cache(self) -> None:
        path = self.data_dir / GEOCODE_CACHE_FILE
        if not path.exists():
            return
        try:
            with open(path, "r", encoding="utf-8") as fh:
                data = json.load(fh)
            # Null entries mean a previous geocode attempt failed — treat them
            # as missing so they get retried on a later startup.
            self._coords = {k: v for k, v in (data.get("entries") or {}).items()
                            if isinstance(v, dict)}
        except (json.JSONDecodeError, OSError):
            self._coords = {}

    def _save_geocode_cache(self) -> None:
        path = self.data_dir / GEOCODE_CACHE_FILE
        payload = {"version": 1, "entries": self._coords}
        tmp = path.with_suffix(".tmp")
        with open(tmp, "w", encoding="utf-8") as fh:
            json.dump(payload, fh, indent=1, ensure_ascii=False)
        import os
        os.replace(tmp, path)

    @staticmethod
    def _geocode_variants(name: str) -> list[str]:
        """Candidate search strings for one dataset name, most specific first."""
        variants = [name]
        expanded = name
        for pattern, full in _ABBREVS.items():
            expanded = re.sub(pattern, full, expanded)
        expanded = re.sub(r"^Intersection of\s+", "", expanded, flags=re.I)
        if expanded != name:
            variants.append(expanded)
        # fallback: just the first road of "X and Y, locality"
        first = re.split(r"\s+and\s+", expanded, maxsplit=1, flags=re.I)[0].strip()
        if first and first != expanded:
            variants.append(first)
        return variants

    async def warm_up(self) -> int:
        """Geocode names not covered by the master coordinates CSV (once).
        Returns how many locations gained coordinates. Safe to call on every
        startup — with the master file present this is a no-op."""
        missing = sorted({loc.name for loc in self.locations
                          if self._normalize_name(loc.name) not in self._master_coords
                          and loc.name not in self._coords})
        if not missing:
            self._apply_coords()
            self._geocoded = True
            return 0

        sem = asyncio.Semaphore(GEOCODE_CONCURRENCY)

        async def resolve(name: str) -> tuple[str, dict | None]:
            async with sem:
                for variant in self._geocode_variants(name):
                    results = await self.geocoder.geocode(variant)
                    for r in results:
                        if _in_mumbai(r.latitude, r.longitude):
                            return name, {
                                "lat": r.latitude,
                                "lon": r.longitude,
                                "formatted": r.formattedAddress,
                            }
            return name, None

        resolved = await asyncio.gather(*(resolve(n) for n in missing))
        for name, coords in resolved:
            self._coords[name] = coords
        self._save_geocode_cache()
        self._apply_coords()
        self._geocoded = True
        return len([c for _, c in resolved if c])

    def _apply_coords(self) -> None:
        for loc in self.locations:
            master = self._master_coords.get(self._normalize_name(loc.name))
            if master:
                loc.latitude = master["lat"]
                loc.longitude = master["lon"]
                continue
            entry = self._coords.get(loc.name)
            if entry:
                loc.latitude = entry["lat"]
                loc.longitude = entry["lon"]
            else:
                loc.latitude = None
                loc.longitude = None

    # ------------------------------------------------------------- spatial API
    @property
    def geocoded_count(self) -> int:
        return sum(1 for loc in self.locations if loc.latitude is not None)

    def in_mumbai(self, lat: float, lon: float) -> bool:
        return _in_mumbai(lat, lon)

    def matches_as_hazards(self, matches: list[RiskMatch]) -> list[Hazard]:
        """Turn dataset matches into real Hazard records so the existing
        hazard factor and segment panel can show them."""
        out: list[Hazard] = []
        for m in matches:
            loc = m.location
            score = loc.risk_score
            if score >= 66:
                severity = "high"
            elif score >= 33:
                severity = "medium"
            else:
                severity = "low"
            htype = "dangerous_intersection" if loc.type in ("junction", "blackspot") else "accident"
            desc = loc.name
            if len(desc) > 90:
                desc = desc[:87] + "..."
            out.append(Hazard(
                id=f"ds-{loc.id}",
                type=htype,
                severity=severity,
                lat=loc.latitude or 0.0,
                lon=loc.longitude or 0.0,
                description=desc,
                source="dataset",
                reported_at="dataset",
                distance_m=round(m.distance_m, 0),
            ))
        return out

    def hazards_near(self, center: Point, radius_m: float, limit: int = 60) -> list[Hazard]:
        """Real dataset locations around a point, as Hazard records — this
        replaces the fabricated demo hazard layer in the live hazards feed."""
        if not _in_mumbai(center[0], center[1]):
            return []
        found: list[Hazard] = []
        for loc in self.locations:
            if loc.latitude is None or loc.longitude is None:
                continue
            d = haversine_km(center, (loc.latitude, loc.longitude)) * 1000.0
            if d <= radius_m:
                score = loc.risk_score
                severity = "high" if score >= 66 else "medium" if score >= 33 else "low"
                htype = ("dangerous_intersection" if loc.type in ("junction", "blackspot")
                         else "accident")
                found.append(Hazard(
                    id=f"ds-{loc.id}",
                    type=htype,
                    severity=severity,
                    lat=loc.latitude,
                    lon=loc.longitude,
                    description=loc.name,
                    source="dataset",
                    reported_at="dataset",
                    distance_m=round(d, 0),
                ))
        found.sort(key=lambda h: h.distance_m or 0)
        return found[:limit]

    def near_segment(self, geometry: list[list[float]], radius_m: float) -> list[RiskMatch]:
        """All dataset records within ``radius_m`` of any point of the segment,
        ranked by penalty (risk_score decayed by distance). Empty outside
        Greater Mumbai — the datasets never apply to other cities."""
        if len(geometry) < 2:
            return []
        mid = geometry[len(geometry) // 2]
        if not _in_mumbai(mid[0], mid[1]):
            return []

        # bounding-box prefilter so we only run haversine on candidates
        lats = [p[0] for p in geometry]
        lons = [p[1] for p in geometry]
        d_lat = radius_m / 111320.0
        d_lon = radius_m / (111320.0 * math.cos(math.radians(mid[0])))
        min_lat, max_lat = min(lats) - d_lat, max(lats) + d_lat
        min_lon, max_lon = min(lons) - d_lon, max(lons) + d_lon

        matches: list[RiskMatch] = []
        for loc in self.locations:
            if loc.latitude is None or loc.longitude is None:
                continue
            if not (min_lat <= loc.latitude <= max_lat and min_lon <= loc.longitude <= max_lon):
                continue
            # nearest distance from the record point to the segment polyline
            best = min(
                haversine_km((loc.latitude, loc.longitude), (p[0], p[1]))
                for p in geometry
            ) * 1000.0
            if best > radius_m:
                continue
            decay = max(0.0, 1.0 - best / radius_m)
            matches.append(RiskMatch(
                location=loc,
                distance_m=round(best, 0),
                penalty=round(loc.risk_score * decay, 1),
            ))
        matches.sort(key=lambda m: -m.penalty)
        return matches

    @staticmethod
    def segment_penalty(matches: list[RiskMatch]) -> float:
        """Combined 0..100 dataset-risk penalty for a segment.

        The strongest record dominates; additional nearby records add a
        capped 30% of their penalty so a cluster of blackspots reads worse
        than a single one while a lone distant record can't max it out."""
        if not matches:
            return 0.0
        penalties = [m.penalty for m in matches]
        total = penalties[0] + 0.3 * sum(penalties[1:5])
        return min(100.0, total)

    @staticmethod
    def summary(matches: list[RiskMatch], radius_m: float) -> str:
        """Short human explanation built only from matched records."""
        if not matches:
            return (f"No high-risk corridor, blackspot junction, or pedestrian "
                    f"blackspot within {int(radius_m)} m of this segment")
        parts = []
        for m in matches[:2]:
            loc = m.location
            parts.append(f"'{loc.name}' — {loc.detail} · {int(m.distance_m)} m away")
        extra = f" · +{len(matches) - 2} more nearby" if len(matches) > 2 else ""
        return "; ".join(parts) + extra
