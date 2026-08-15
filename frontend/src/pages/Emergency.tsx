import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Car,
  CheckCircle2,
  ClipboardCopy,
  ExternalLink,
  Loader2,
  MapPin,
  Navigation,
  PhoneCall,
  Share2,
  Siren,
} from "lucide-react";
import { MapView } from "../components/map/MapView";
import { PillButton, SectionLabel, Spinner } from "../components/ui";
import {
  DEFAULT_MAP_CENTER,
  DEV_LOCATION,
  EMERGENCY_SEARCH_RADIUS_KM,
} from "../config";
import { useCountdown } from "../hooks/useCountdown";
import { useGeolocation } from "../hooks/useGeolocation";
import { api } from "../services/api";
import type { EmergencyResponse, EmergencyRoute, LatLng } from "../types";

type Mode = "idle" | "crash" | "active";

// Distance (meters) from the drawn route that triggers a route recalculation.
const ROUTE_DEVIATION_M = 250;
// Minimum time between automatic route recalculations (avoid API spam).
const ROUTE_RECALC_COOLDOWN_MS = 20_000;
// Max radius (km) the user can expand the hospital search to.
const MAX_SEARCH_RADIUS_KM = 50;

/** Minimum distance (meters) from a point to a polyline, in local meters. */
function distanceToRouteMeters(
  pos: { lat: number; lon: number },
  geometry: LatLng[],
): number {
  const R = 6371000;
  const latRef = (pos.lat * Math.PI) / 180;
  const toLocal = ([lat, lon]: LatLng) => ({
    x: (((lon - pos.lon) * Math.PI) / 180) * R * Math.cos(latRef),
    y: (((lat - pos.lat) * Math.PI) / 180) * R,
  });
  const distToSegment = (
    p: { x: number; y: number },
    a: { x: number; y: number },
    b: { x: number; y: number },
  ) => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
    let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
  };
  let min = Infinity;
  for (let i = 0; i < geometry.length - 1; i++) {
    min = Math.min(
      min,
      distToSegment(
        { x: 0, y: 0 },
        toLocal(geometry[i]),
        toLocal(geometry[i + 1]),
      ),
    );
  }
  return min;
}

function formatDistance(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
}

export function Emergency({ onGoDashboard }: { onGoDashboard: () => void }) {
  const [mode, setMode] = useState<Mode>("idle");
  const [emergency, setEmergency] = useState<EmergencyResponse | null>(null);
  const [navRoute, setNavRoute] = useState<EmergencyRoute | null>(null);
  const [activating, setActivating] = useState(false);
  const [routing, setRouting] = useState(false);
  const [sharing, setSharing] = useState<"ok" | "copied" | null>(null);
  const [recovered, setRecovered] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [hospitalError, setHospitalError] = useState<string | null>(null);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [searchRadius, setSearchRadius] = useState(EMERGENCY_SEARCH_RADIUS_KM);
  const [usingDevLocation, setUsingDevLocation] = useState(false);
  const geo = useGeolocation();

  const lastRecalc = useRef(0);
  const recalcInFlight = useRef(false);

  // Map display location: real GPS fix → dev override → demo center.
  const location = geo.position ??
    DEV_LOCATION ?? { lat: DEFAULT_MAP_CENTER[0], lon: DEFAULT_MAP_CENTER[1] };
  const countdown = useCountdown(emergency?.countdown_seconds ?? 60);

  useEffect(() => {
    if (mode === "active" && emergency)
      countdown.reset(emergency.countdown_seconds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, emergency?.activated_at]);

  const topHospital = emergency?.hospitals[0] ?? null;
  const topHospitalName = topHospital?.name || "Hospital";

  /** Resolve the driver's real location: GPS first, then dev override. */
  const resolveLocation = useCallback(async (): Promise<{
    lat: number;
    lon: number;
  } | null> => {
    if (geo.position) return geo.position;
    const fresh = await geo.getPosition();
    if (fresh) return fresh;
    if (DEV_LOCATION) {
      setUsingDevLocation(true);
      return DEV_LOCATION;
    }
    setLocationError(
      "Unable to access your current location. Please enable location permissions.",
    );
    return null;
  }, [geo]);

  /** Request the OSRM navigation route to the selected hospital. */
  const startNavigation = useCallback(
    async (
      loc: { lat: number; lon: number },
      hospital: { lat: number; lon: number; id: string },
    ) => {
      setRouting(true);
      setRouteError(null);
      lastRecalc.current = Date.now();
      try {
        const route = await api.getEmergencyRoute(
          [loc.lat, loc.lon],
          [hospital.lat, hospital.lon],
          hospital.id,
        );
        setNavRoute(route);
      } catch {
        // Keep the last good route on the map; never claim a route we don't have.
        setRouteError(
          "Unable to compute the driving route right now. Follow the map to the hospital.",
        );
      } finally {
        setRouting(false);
      }
    },
    [],
  );

  const activate = useCallback(
    async (radiusKm?: number) => {
      setActivating(true);
      setLocationError(null);
      setHospitalError(null);
      setRouteError(null);
      try {
        const loc = await resolveLocation();
        if (!loc) return;
        const res = await api.activateEmergency(loc.lat, loc.lon, radiusKm);
        setEmergency(res);
        setSearchRadius(res.search_radius_km);
        setMode("active");
        countdown.reset(res.countdown_seconds);
        const top = res.hospitals[0];
        if (top) {
          await startNavigation(loc, top);
        } else {
          setNavRoute(null);
        }
      } catch {
        // Overpass (or the backend) failed — never fabricate hospitals.
        setHospitalError("Unable to retrieve nearby hospitals right now.");
      } finally {
        setActivating(false);
      }
    },
    [resolveLocation, startNavigation, countdown],
  );

  /** Widen the search radius and re-run hospital discovery (no hospitals found). */
  const expandRadius = useCallback(() => {
    const bigger = Math.min(
      MAX_SEARCH_RADIUS_KM,
      Math.round(searchRadius * 1.67),
    );
    setSearchRadius(bigger);
    void activate(bigger);
  }, [searchRadius, activate]);

  // Live GPS updates: recalculate the route only when the driver deviates
  // significantly, with a cooldown so we don't hammer the API on every tick.
  useEffect(() => {
    if (mode !== "active" || !emergency || !navRoute) return;
    const pos = geo.position;
    if (!pos || !topHospital) return;
    const off = distanceToRouteMeters(pos, navRoute.geometry);
    const now = Date.now();
    if (
      off > ROUTE_DEVIATION_M &&
      !recalcInFlight.current &&
      now - lastRecalc.current > ROUTE_RECALC_COOLDOWN_MS
    ) {
      lastRecalc.current = now;
      recalcInFlight.current = true;
      void startNavigation(pos, topHospital).finally(() => {
        recalcInFlight.current = false;
      });
    }
  }, [geo.position, mode, emergency, navRoute, topHospital, startNavigation]);

  const share = useCallback(async () => {
    if (!emergency) return;
    const text = `Emergency detected.\nCurrent location: ${emergency.map_link}`;
    try {
      if (navigator.share) {
        await navigator.share({
          title: "RoadSafe AI — Emergency",
          text,
          url: emergency.map_link,
        });
        setSharing("ok");
      } else {
        await navigator.clipboard.writeText(text);
        setSharing("copied");
      }
    } catch {
      /* share cancelled */
    } finally {
      setTimeout(() => setSharing(null), 2500);
    }
  }, [emergency]);

  // First real maneuver (skips the tiny "depart" micro-step and "arrive").
  const nextStep = useMemo(() => {
    const steps = navRoute?.steps ?? [];
    return (
      steps.find(
        (s) =>
          s.distance_m >= 30 && !s.instruction.toLowerCase().includes("arrive"),
      ) ?? null
    );
  }, [navRoute]);
  const nextInstruction =
    nextStep?.instruction ?? "Follow the highlighted route";

  return (
    <div className="min-h-screen bg-neutral-50 pb-16">
      <div className="mx-auto mt-20 max-w-6xl px-4">
        {/* header */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-red-600 text-white">
              <Siren size={20} />
            </span>
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight text-neutral-900">
                {mode === "active" ? "EMERGENCY MODE" : "Emergency Response"}
              </h1>
              <p className="text-xs text-neutral-400">
                {mode === "active"
                  ? "Response active — hospitals discovered live from OpenStreetMap, ranked by OSRM road ETA."
                  : "When seconds matter, you shouldn’t be searching for a number."}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {mode === "active" && emergency && (
              <div className="rounded-full bg-red-50 px-4 py-2 text-sm font-bold text-red-600">
                {emergency.emergency_number} · {emergency.region}
              </div>
            )}
            <button
              onClick={onGoDashboard}
              className="cursor-pointer rounded-full border border-neutral-300 bg-white px-4 py-2 text-xs font-bold text-neutral-800 hover:bg-neutral-100"
            >
              Back to Ride
            </button>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
          {/* map */}
          <div className="relative h-[420px] overflow-hidden rounded-2xl border border-neutral-200 shadow-sm lg:h-[560px]">
            <MapView
              center={[location.lat, location.lon]}
              zoom={13}
              userLocation={location}
              hospitals={
                mode === "active" ? (emergency?.hospitals ?? []) : undefined
              }
              showHospitals={mode === "active"}
              emergencyRoute={navRoute}
              emergencyDestinationName={topHospitalName}
            />
            {mode === "idle" && (
              <div className="absolute left-3 top-3 z-[1000] rounded-xl bg-white/95 px-3 py-2 text-xs font-semibold text-neutral-600 shadow">
                <MapPin size={11} className="mr-1 inline text-blue-500" />
                Your location
                {geo.position
                  ? ""
                  : usingDevLocation
                    ? " (dev override)"
                    : " (no GPS fix)"}
              </div>
            )}
          </div>

          {/* right panel */}
          <div className="space-y-4">
            {mode === "idle" && (
              <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
                <SectionLabel>Crash detection</SectionLabel>
                <h2 className="mt-1.5 text-lg font-bold text-neutral-900">
                  Simulate a collision
                </h2>
                <p className="mt-1 text-sm leading-relaxed text-neutral-500">
                  In a real vehicle, accelerometer spikes would trigger this.
                  For the demo, simulate it — then activate emergency response
                  in one tap.
                </p>
                <PillButton
                  variant="red"
                  className="mt-4 w-full"
                  onClick={() => setMode("crash")}
                >
                  <Car size={15} /> SIMULATE CRASH
                </PillButton>
                <p className="mt-3 text-[10px] leading-relaxed text-neutral-400">
                  Pipeline: sensor spike → velocity change → potential crash →
                  driver confirmation → real GPS → OpenStreetMap hospitals →
                  OSRM ETA ranking → navigation.
                </p>
              </section>
            )}

            {mode === "active" && emergency && (
              <>
                {/* countdown */}
                <section className="rounded-2xl border border-red-200 bg-white p-5 text-center shadow-sm">
                  <div className="rounded-xl bg-neutral-50 px-3 py-4 text-left">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-neutral-500">
                        Fastest reachable hospital
                      </span>
                      <span className="font-bold text-neutral-900">
                        {topHospitalName}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-xs">
                      <span className="text-neutral-500">
                        Estimated road ETA
                      </span>
                      <span className="text-lg font-extrabold text-red-500">
                        {topHospital?.eta_min != null
                          ? `${topHospital.eta_min} min`
                          : "—"}
                      </span>
                    </div>
                  </div>
                </section>

                {/* navigation panel */}
                {navRoute && (
                  <section className="rounded-2xl border border-red-200 bg-white p-5 shadow-sm">
                    <SectionLabel>Emergency route</SectionLabel>
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <h2 className="text-lg font-extrabold tracking-tight text-neutral-900">
                        🏥 {topHospitalName}
                      </h2>
                      {routing && (
                        <Loader2
                          size={14}
                          className="animate-spin text-red-500"
                        />
                      )}
                    </div>
                    <div className="mt-2 flex items-center gap-6">
                      <div>
                        <div className="text-3xl font-extrabold tabular-nums text-red-500">
                          {Math.ceil(navRoute.duration_min)}
                          <span className="text-sm font-bold text-neutral-400">
                            {" "}
                            min
                          </span>
                        </div>
                        <div className="text-[10px] font-semibold uppercase tracking-widest text-neutral-400">
                          ETA
                        </div>
                      </div>
                      <div>
                        <div className="text-2xl font-extrabold tabular-nums text-neutral-900">
                          {navRoute.distance_km} km
                        </div>
                        <div className="text-[10px] font-semibold uppercase tracking-widest text-neutral-400">
                          distance
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 rounded-xl bg-red-50 px-3 py-2.5">
                      <div className="text-[9px] font-bold uppercase tracking-widest text-red-400">
                        Next
                      </div>
                      <div className="mt-0.5 text-sm font-bold text-neutral-900">
                        {nextInstruction}
                      </div>
                      {nextStep && (
                        <div className="mt-0.5 text-xs font-semibold text-neutral-500">
                          {formatDistance(nextStep.distance_m)}
                        </div>
                      )}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-neutral-400">
                      <span
                        className={`rounded-full px-2 py-0.5 font-bold tracking-wider ${
                          navRoute.source === "live"
                            ? "bg-green-100 text-green-700"
                            : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {navRoute.source === "live" ? "● LIVE" : "○ DEMO"} ·{" "}
                        {navRoute.provider.toUpperCase()}
                      </span>
                      <span>Route geometry &amp; instructions by OSRM</span>
                    </div>
                    {routeError && (
                      <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                        {routeError}
                      </div>
                    )}
                  </section>
                )}

                {/* one-tap actions */}
                <section className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
                  <SectionLabel>One-tap actions</SectionLabel>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <a
                      href={`tel:${emergency.emergency_number}`}
                      className="flex cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-red-600 py-3 text-sm font-bold text-white hover:bg-red-500"
                    >
                      <PhoneCall size={15} /> Call {emergency.emergency_number}
                    </a>
                    <button
                      onClick={share}
                      className="flex cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-neutral-900 py-3 text-sm font-bold text-white hover:bg-neutral-700"
                    >
                      {sharing === "copied" ? (
                        <ClipboardCopy size={15} />
                      ) : sharing === "ok" ? (
                        <CheckCircle2 size={15} />
                      ) : (
                        <Share2 size={15} />
                      )}
                      {sharing === "copied"
                        ? "Copied!"
                        : sharing === "ok"
                          ? "Shared!"
                          : "Share location"}
                    </button>
                    <a
                      href={emergency.map_link}
                      target="_blank"
                      rel="noreferrer"
                      className="flex cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-neutral-200 py-3 text-sm font-semibold text-neutral-700 hover:bg-neutral-100"
                    >
                      <ExternalLink size={14} /> Open map
                    </a>
                    <button
                      onClick={() => {
                        setMode("idle");
                        setEmergency(null);
                        setNavRoute(null);
                        setRouteError(null);
                      }}
                      className="flex cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-neutral-200 py-3 text-sm font-semibold text-neutral-700 hover:bg-neutral-100"
                    >
                      End response
                    </button>
                  </div>
                </section>
              </>
            )}

            {mode !== "active" && (
              <section className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
                <SectionLabel>Location</SectionLabel>
                <div className="mt-1.5 flex items-center gap-2 text-sm font-medium text-neutral-800">
                  <Navigation size={13} className="text-blue-500" />
                  {location.lat.toFixed(4)}, {location.lon.toFixed(4)}
                  {geo.position
                    ? " · GPS fix"
                    : usingDevLocation
                      ? " · dev override (VITE_DEV_LOCATION)"
                      : " · no GPS fix — allow location for real emergency routing"}
                </div>
              </section>
            )}
          </div>
        </div>

        {/* hospitals list */}
        {mode === "active" && emergency && (
          <section className="mt-5 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <SectionLabel>
                  Nearest reachable hospitals — ranked by road ETA
                </SectionLabel>
                <p className="mt-0.5 text-[11px] text-neutral-400">
                  Discovered live from{" "}
                  <span className="font-semibold text-neutral-600">
                    OpenStreetMap
                  </span>{" "}
                  around your GPS position · ranked by real{" "}
                  <span className="font-semibold text-neutral-600">OSRM</span>{" "}
                  road ETA. The fastest reachable care wins.
                </p>
              </div>
            </div>
            {emergency.hospitals.length === 0 ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-5 text-center">
                <p className="text-sm font-bold text-amber-800">
                  No hospitals were found within {searchRadius} km.
                </p>
                <p className="mt-0.5 text-xs text-amber-700">
                  Try widening the search around your location.
                </p>
                <button
                  onClick={expandRadius}
                  disabled={activating}
                  className="mt-3 cursor-pointer rounded-full bg-neutral-900 px-4 py-2 text-xs font-bold text-white hover:bg-neutral-700 disabled:opacity-50"
                >
                  {activating
                    ? "Searching…"
                    : `Expand search radius to ${Math.min(MAX_SEARCH_RADIUS_KM, Math.round(searchRadius * 1.67))} km`}
                </button>
              </div>
            ) : (
              <ol className="grid gap-2 md:grid-cols-2">
                {emergency.hospitals.map((h, i) => (
                  <li
                    key={h.id}
                    className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${
                      i === 0
                        ? "border-red-300 bg-red-50/60"
                        : "border-neutral-100 bg-neutral-50/60"
                    }`}
                  >
                    <span
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-extrabold text-white ${
                        i === 0 ? "bg-red-500" : "bg-neutral-400"
                      }`}
                    >
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <div className="truncate text-sm font-bold text-neutral-900">
                          {h.name || "Hospital"}
                        </div>
                        {i === 0 && (
                          <span className="shrink-0 rounded-full bg-red-600 px-1.5 py-0.5 text-[8px] font-extrabold uppercase tracking-wider text-white">
                            RECOMMENDED
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-neutral-500">
                        {h.eta_min != null ? (
                          <>
                            <span className="text-sm font-extrabold text-neutral-900">
                              {h.eta_min} min
                            </span>
                            <span>ETA</span>
                          </>
                        ) : (
                          <span className="text-xs font-semibold text-amber-600">
                            Driving time unavailable
                          </span>
                        )}
                        <span>·</span>
                        <span>{h.distance_km} km</span>
                        <span
                          className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                            h.eta_source === "live"
                              ? "bg-green-100 text-green-700"
                              : "bg-amber-100 text-amber-700"
                          }`}
                        >
                          {h.eta_source === "live"
                            ? "Live road ETA"
                            : h.eta_source === "estimated"
                              ? "Estimated"
                              : "No route"}
                        </span>
                      </div>
                    </div>
                    {h.phone && (
                      <a
                        href={`tel:${h.phone}`}
                        title={`Call ${h.name || "Hospital"}`}
                        className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full bg-neutral-900 text-white hover:bg-neutral-700"
                      >
                        <PhoneCall size={14} />
                      </a>
                    )}
                  </li>
                ))}
              </ol>
            )}
            <p className="mt-3 text-[10px] text-neutral-400">
              Hospital data:{" "}
              <span className="font-semibold">OpenStreetMap</span> · Road ETAs:{" "}
              <span className="font-semibold">OSRM</span>. Hospitals OSRM
              couldn’t route show “Driving time unavailable” instead of a
              made-up ETA.
            </p>
          </section>
        )}

        <p className="mt-4 flex items-start gap-1.5 text-[10px] leading-relaxed text-neutral-400">
          <AlertTriangle size={11} className="mt-0.5 shrink-0" />
          Hackathon prototype: ETAs and crash detection are estimates, not
          guarantees. In a real emergency, call your local emergency number.
        </p>
      </div>

      {/* crash overlay */}
      {mode === "crash" && (
        <div className="fixed inset-0 z-[1500] flex items-center justify-center bg-neutral-950/70 p-4 backdrop-blur-sm">
          <div className="alert-flash w-full max-w-md rounded-3xl border-2 border-red-400 bg-white p-8 text-center shadow-2xl">
            <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-red-500 text-white">
              <Car size={34} />
            </div>
            <h2 className="text-2xl font-extrabold tracking-tight text-neutral-900">
              Potential collision detected
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-neutral-500">
              Sudden deceleration and acceleration spike detected. Are you okay?
            </p>
            {locationError && (
              <div className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
                {locationError}
              </div>
            )}
            {hospitalError && (
              <div className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
                {hospitalError}
              </div>
            )}
            {recovered && (
              <div className="mt-3 rounded-xl bg-green-50 px-3 py-2 text-sm font-semibold text-green-700">
                Glad you're safe. Monitoring resumed.
              </div>
            )}
            <div className="mt-5 flex flex-col gap-2">
              <PillButton
                variant="black"
                onClick={() => {
                  setRecovered(true);
                  setTimeout(() => {
                    setMode("idle");
                    setRecovered(false);
                    setLocationError(null);
                    setHospitalError(null);
                  }, 1800);
                }}
              >
                <CheckCircle2 size={16} /> I'M OK
              </PillButton>
              <PillButton
                variant="red"
                onClick={() => void activate()}
                disabled={activating}
              >
                {activating ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <Siren size={15} />
                )}
                ACTIVATE EMERGENCY RESPONSE
              </PillButton>
            </div>
            {!geo.position && !DEV_LOCATION && (
              <p className="mt-3 text-[10px] leading-relaxed text-neutral-400">
                No GPS fix yet. We'll request your real location on activation —
                enable location permissions when prompted. (Developers: set{" "}
                <code className="font-mono">
                  VITE_DEV_LOCATION=&quot;lat,lon&quot;
                </code>{" "}
                to test without GPS.)
              </p>
            )}
          </div>
        </div>
      )}

      {activating && (
        <div className="fixed inset-0 z-[1600] flex items-center justify-center bg-white/60 backdrop-blur-sm">
          <div className="flex items-center gap-3 rounded-2xl border border-neutral-200 bg-white px-6 py-4 shadow-xl">
            <Spinner className="h-5 w-5 text-red-500" />
            <span className="text-sm font-semibold text-neutral-700">
              Finding nearby hospitals on OpenStreetMap…
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
