import { useCallback, useEffect, useRef, useState } from "react";
import {
  Car,
  CheckCircle2,
  ClipboardCopy,
  ExternalLink,
  MapPin,
  PhoneCall,
  Share2,
  Siren,
} from "lucide-react";
import { MapView } from "../components/map/MapView";
import { PillButton, SectionLabel } from "../components/ui";
import { DEFAULT_MAP_CENTER, DEV_LOCATION } from "../config";
import { useCountdown } from "../hooks/useCountdown";
import { useGeolocation } from "../hooks/useGeolocation";
import { api } from "../services/api";
import type { EmergencyResponse, EmergencyRoute, LatLng } from "../types";

type Mode = "idle" | "crash" | "active";
type LoadingStep = "location" | "hospitals" | "routing" | null;

// Distance (meters) from the drawn route that triggers a route recalculation.
const ROUTE_DEVIATION_M = 250;
// Minimum time between automatic route recalculations (avoid API spam).
const ROUTE_RECALC_COOLDOWN_MS = 20_000;
// Max radius (km) the user can expand the hospital search to.
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

export function Emergency({ onGoDashboard }: { onGoDashboard: () => void }) {
  const [mode, setMode] = useState<Mode>("idle");
  const [emergency, setEmergency] = useState<EmergencyResponse | null>(null);
  const [navRoute, setNavRoute] = useState<EmergencyRoute | null>(null);
  const [sharing, setSharing] = useState<"ok" | "copied" | null>(null);
  const [usingDevLocation, setUsingDevLocation] = useState(false);
  const [loadingStep, setLoadingStep] = useState<LoadingStep>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const geo = useGeolocation();

  const lastRecalc = useRef(0);
  const recalcInFlight = useRef(false);

  // CRITICAL FIX: Request location immediately on mount if not available
  useEffect(() => {
    if (!geo.position && !geo.loading && !geo.error) {
      console.log("[Emergency] No position yet, requesting location...");
      geo.getPosition().then((pos) => {
        if (pos) {
          console.log("[Emergency] Location obtained:", pos);
        } else {
          console.warn("[Emergency] Failed to get location");
        }
      });
    }
  }, [geo]);

  // Map display location: real GPS fix → dev override → demo center.
  const location = geo.position ??
    DEV_LOCATION ?? { lat: DEFAULT_MAP_CENTER[0], lon: DEFAULT_MAP_CENTER[1] };
  const countdown = useCountdown(emergency?.countdown_seconds ?? 60);

  // Debug logging for location state
  useEffect(() => {
    console.log("[Emergency] Location state:", {
      "geo.position": geo.position,
      "geo.error": geo.error,
      "geo.loading": geo.loading,
      "DEV_LOCATION": DEV_LOCATION,
      "resolved location": location,
    });
  }, [geo.position, geo.error, geo.loading, location]);

  useEffect(() => {
    if (mode === "active" && emergency)
      countdown.reset(emergency.countdown_seconds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, emergency?.activated_at]);

  const topHospital = emergency?.hospitals[0] ?? null;
  const topHospitalName = topHospital?.name || "Hospital";

  // Allow safe demo location fallback without leaving the UI in a broken state.
  useEffect(() => {
    if (geo.position) {
      setUsingDevLocation(false);
    }
  }, [geo.position]);

  /** Request the OSRM navigation route to the selected hospital. */
  const startNavigation = useCallback(
    async (
      loc: { lat: number; lon: number },
      hospital: { lat: number; lon: number; id: string },
    ) => {
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
      }
    },
    [],
  );

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

  const triggerDemoEmergency = useCallback(() => {
    const fallback: EmergencyResponse = {
      emergency_number: "112",
      region: "Mumbai",
      message: "Crash detected. Dispatching nearest trauma support.",
      map_link: "https://maps.google.com/?q=19.0596,72.8295",
      countdown_seconds: 90,
      hospitals: [
        {
          id: "demo-hospital-1",
          name: "Demo Trauma Center",
          address: "Demo Road, Mumbai",
          lat: 19.0596,
          lon: 72.8295,
          distance_km: 2.4,
          eta_min: 6,
          phone: "112",
          source: "demo",
          eta_source: "estimated",
        },
      ],
      search_radius_km: 15,
      hospitals_source: "demo",
      activated_at: new Date().toISOString(),
    };
    setEmergency(fallback);
    setMode("active");
  }, []);

  /** Activate live emergency with progress indicators */
  const activateLiveEmergency = useCallback(async () => {
    console.log("[Emergency] Starting activation...");
    console.log("[Emergency] existing app location (geo.position):", geo.position);
    console.log("[Emergency] geo.error:", geo.error);
    console.log("[Emergency] DEV_LOCATION:", DEV_LOCATION);
    
    setLoadingStep("location");
    setErrorMessage(null);
    setMode("crash");

    try {
      // Step 1: Get location - try existing position first, then request if needed
      let loc = geo.position ?? DEV_LOCATION;
      
      // If no existing position, try to get it now
      if (!loc) {
        console.log("[Emergency] No existing location, requesting from browser...");
        setLoadingStep("location");
        const freshPos = await geo.getPosition();
        loc = freshPos ?? null;
      }
      
      console.log("[Emergency] resolved location:", loc);
      
      if (!loc) {
        const msg = geo.error 
          ? `Cannot access location: ${geo.error}. Please allow location access in your browser.` 
          : "Unable to determine your location. Please enable location access.";
        setErrorMessage(msg);
        setLoadingStep(null);
        setMode("idle");
        console.error("[Emergency]", msg);
        return;
      }

      console.log("[Emergency] latitude:", loc.lat);
      console.log("[Emergency] longitude:", loc.lon);

      // Step 2: Search hospitals
      setLoadingStep("hospitals");
      console.log("[Emergency] Sending location to backend:", loc);
      const response = await api.activateEmergency(loc.lat, loc.lon);
      console.log("[Emergency] API response:", response);
      setEmergency(response);

      // Step 3: Calculate route to nearest hospital
      if (response.hospitals && response.hospitals.length > 0) {
        setLoadingStep("routing");
        const nearest = response.hospitals[0];
        console.log("[Emergency] Getting route to:", nearest.name);
        await startNavigation(loc, nearest);
        console.log("[Emergency] Navigation started");
      } else {
        console.warn("[Emergency] No hospitals returned from API");
      }

      setMode("active");
      setLoadingStep(null);
      console.log("[Emergency] Activation complete");
    } catch (err) {
      console.error("[Emergency] Activation failed:", err);
      
      // Only fall back to demo if it's a real API error, not a missing location
      const errorMsg = err instanceof Error ? err.message : String(err);
      setErrorMessage(
        errorMsg.includes("timeout")
          ? "Service timeout — API took too long to respond"
          : errorMsg.includes("502")
            ? "Backend error — check backend logs"
            : `API Error: ${errorMsg}`,
      );
      
      // DON'T auto-fallback to demo - let user decide
      setMode("idle");
      setLoadingStep(null);
    }
  }, [geo, startNavigation]);

  // First real maneuver (skips the tiny "depart" micro-step and "arrive").
  return (
    <div
      className="min-h-screen pb-28 transition-colors overflow-y-auto"
      style={{ background: "var(--bg)", color: "var(--text)" }}
    >
      <div className="mx-auto pt-16 sm:pt-24 max-w-6xl px-4">
        {/* Header */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-red-600 text-white shadow-lg">
              <Siren size={20} />
            </span>
            <div>
              <h1
                className="text-2xl font-extrabold tracking-tight"
                style={{ color: "var(--text)" }}
              >
                {mode === "active" ? "EMERGENCY MODE" : "Emergency Response"}
              </h1>
              <p className="text-xs" style={{ color: "var(--text-3)" }}>
                {mode === "active"
                  ? "Response active — nearest hospitals ranked by road ETA."
                  : "When seconds matter, you shouldn’t be searching for a number."}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {mode === "active" && emergency && (
              <div className="rounded-full bg-red-500/10 px-4 py-2 text-sm font-bold text-red-500 border border-red-500/20">
                {emergency.emergency_number} · {emergency.region}
              </div>
            )}
            <button
              onClick={onGoDashboard}
              className="cursor-pointer rounded-full px-4 py-2 text-xs font-bold transition-all shadow-sm"
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                color: "var(--text)",
              }}
            >
              Back to Ride
            </button>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
          {/* Map */}
          <div
            className="relative h-[260px] sm:h-[400px] lg:h-[520px] overflow-hidden rounded-2xl border shadow-sm"
            style={{ borderColor: "var(--border)" }}
          >
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
              <div
                className="absolute left-3 top-3 z-[1000] rounded-xl px-3 py-2 text-xs font-semibold shadow backdrop-blur-md"
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  color: "var(--text)",
                }}
              >
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

          {/* Right Panel */}
          <div className="space-y-4">
            {/* Location Debug Info */}
            {mode === "idle" && !errorMessage && (
              <div
                className="text-center text-xs px-3 py-2 rounded-lg border"
                style={{
                  background: "var(--surface)",
                  borderColor: "var(--border)",
                  color: "var(--text-3)",
                }}
              >
                <MapPin size={12} className="inline mr-1" />
                {geo.loading ? (
                  <span className="text-blue-600 font-semibold">
                    Getting your location...
                  </span>
                ) : geo.position ? (
                  <span className="text-green-600 font-semibold">
                    ✓ Live GPS: {geo.position.lat.toFixed(4)}, {geo.position.lon.toFixed(4)}
                  </span>
                ) : DEV_LOCATION ? (
                  <span className="text-blue-600 font-semibold">
                    Using dev location: {DEV_LOCATION.lat.toFixed(4)}, {DEV_LOCATION.lon.toFixed(4)}
                  </span>
                ) : geo.error ? (
                  <span className="text-yellow-600 font-semibold">
                    Location access needed - {geo.error}
                  </span>
                ) : (
                  <span className="text-yellow-600 font-semibold">
                    Requesting location access...
                  </span>
                )}
              </div>
            )}

            {mode === "idle" && (
              <>
                {/* Location Status */}
                {geo.error && !geo.position && (
                  <section
                    className="rounded-2xl p-4 shadow-sm border border-yellow-500/20 bg-yellow-500/5"
                    style={{
                      borderColor: "var(--border)",
                    }}
                  >
                    <div className="flex items-start gap-3">
                      <MapPin size={18} className="text-yellow-600 mt-0.5 flex-shrink-0" />
                      <div className="flex-1">
                        <div className="text-sm font-bold text-yellow-700">
                          Location access needed
                        </div>
                        <div className="text-xs text-yellow-600 mt-1">
                          {geo.error.includes("denied") || geo.error.includes("permission")
                            ? "Please enable location access in your browser settings to use live emergency services."
                            : geo.error}
                        </div>
                        <div className="text-[10px] text-yellow-600/70 mt-2">
                          Demo mode will use a fallback location
                        </div>
                      </div>
                    </div>
                  </section>
                )}

                <section
                  className="rounded-2xl p-5 shadow-sm border"
                  style={{
                    background: "var(--surface)",
                    borderColor: "var(--border)",
                  }}
                >
                  <SectionLabel>Crash detection</SectionLabel>
                  <h2
                    className="mt-1.5 text-lg font-bold"
                    style={{ color: "var(--text)" }}
                  >
                    Simulate a collision
                  </h2>
                  <p
                    className="mt-1 text-xs leading-relaxed"
                    style={{ color: "var(--text-3)" }}
                  >
                    In a real vehicle, accelerometer spikes would trigger this.
                    For the demo, simulate it — then activate emergency response
                    in one tap.
                  </p>
                  <PillButton
                    variant="red"
                    className="mt-4 w-full"
                    onClick={activateLiveEmergency}
                  >
                    <Car size={15} /> SIMULATE CRASH
                  </PillButton>
                  <p
                    className="mt-3 text-[10px] leading-relaxed"
                    style={{ color: "var(--text-4)" }}
                  >
                    Pipeline: sensor spike → velocity change → potential crash →
                    driver confirmation → emergency mode.
                  </p>
                </section>
              </>
            )}

            {mode === "crash" && loadingStep && (
              <section
                className="rounded-2xl border border-yellow-500/20 p-5 shadow-sm"
                style={{ background: "var(--surface)" }}
              >
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-yellow-500 border-t-transparent" />
                  <div className="flex-1">
                    <div
                      className="text-sm font-bold"
                      style={{ color: "var(--text)" }}
                    >
                      {loadingStep === "location" && "Finding your location..."}
                      {loadingStep === "hospitals" &&
                        "Searching nearby hospitals..."}
                      {loadingStep === "routing" &&
                        "Calculating fastest route..."}
                    </div>
                    <div
                      className="text-[10px]"
                      style={{ color: "var(--text-3)" }}
                    >
                      {loadingStep === "location" && "Using GPS coordinates"}
                      {loadingStep === "hospitals" &&
                        "Querying OpenStreetMap within 15km"}
                      {loadingStep === "routing" &&
                        "Computing road ETAs via OSRM"}
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setMode("idle");
                      setLoadingStep(null);
                      setErrorMessage(null);
                    }}
                    className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1"
                  >
                    Cancel
                  </button>
                </div>
              </section>
            )}

            {/* Error State with Retry/Demo Options */}
            {mode === "idle" && errorMessage && (
              <section
                className="rounded-2xl p-4 shadow-sm border border-red-500/20 bg-red-500/5"
              >
                <div className="flex items-start gap-3">
                  <Siren size={18} className="text-red-600 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <div className="text-sm font-bold text-red-700">
                      Emergency activation failed
                    </div>
                    <div className="text-xs text-red-600 mt-1">
                      {errorMessage}
                    </div>
                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={activateLiveEmergency}
                        className="text-xs bg-red-600 text-white px-3 py-1.5 rounded-lg hover:bg-red-700"
                      >
                        Retry
                      </button>
                      <button
                        onClick={triggerDemoEmergency}
                        className="text-xs bg-gray-600 text-white px-3 py-1.5 rounded-lg hover:bg-gray-700"
                      >
                        Use Demo Mode
                      </button>
                    </div>
                  </div>
                </div>
              </section>
            )}

            {mode === "active" && emergency && (
              <>
                {/* Countdown */}
                <section
                  className="rounded-2xl border border-red-500/20 p-5 text-center shadow-sm"
                  style={{ background: "var(--surface)" }}
                >
                  <div className="relative mx-auto h-[140px] w-[140px]">
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-red-500">
                        Response active
                      </span>
                      <span
                        className="text-2xl font-black tabular-nums"
                        style={{ color: "var(--text)" }}
                      >
                        {String(Math.floor(countdown.remaining / 60)).padStart(
                          2,
                          "0",
                        )}
                        :{String(countdown.remaining % 60).padStart(2, "0")}
                      </span>
                      <span
                        className="text-[9px]"
                        style={{ color: "var(--text-4)" }}
                      >
                        until ETA estimate refreshes
                      </span>
                    </div>
                  </div>
                  <div
                    className="mt-3 rounded-xl p-3 text-left border"
                    style={{
                      background: "var(--bg-2)",
                      borderColor: "var(--border)",
                    }}
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span style={{ color: "var(--text-3)" }}>
                        Nearest hospital
                      </span>
                      <span
                        className="font-bold"
                        style={{ color: "var(--text)" }}
                      >
                        {emergency.hospitals[0]?.name ?? "—"}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-xs">
                      <span style={{ color: "var(--text-3)" }}>
                        Estimated road ETA
                      </span>
                      <span className="text-lg font-black text-red-500">
                        {emergency.hospitals[0]?.eta_min} min
                      </span>
                    </div>
                  </div>
                </section>

                {/* Actions */}
                <section
                  className="rounded-2xl p-4 shadow-sm border"
                  style={{
                    background: "var(--surface)",
                    borderColor: "var(--border)",
                  }}
                >
                  <SectionLabel>One-tap actions</SectionLabel>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <a
                      href={`tel:${emergency.emergency_number}`}
                      className="flex cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-red-600 py-3 text-xs font-bold text-white hover:bg-red-500 shadow-md"
                    >
                      <PhoneCall size={14} /> Call {emergency.emergency_number}
                    </a>
                    <button
                      onClick={share}
                      className="flex cursor-pointer items-center justify-center gap-1.5 rounded-xl py-3 text-xs font-bold text-white shadow-md"
                      style={{ background: "var(--text)" }}
                    >
                      {sharing === "copied" ? (
                        <ClipboardCopy size={14} />
                      ) : sharing === "ok" ? (
                        <CheckCircle2 size={14} />
                      ) : (
                        <Share2 size={14} />
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
                      className="flex cursor-pointer items-center justify-center gap-1.5 rounded-xl py-3 text-xs font-semibold border transition-all"
                      style={{
                        background: "var(--bg-2)",
                        borderColor: "var(--border)",
                        color: "var(--text)",
                      }}
                    >
                      <ExternalLink size={13} /> Open map
                    </a>
                    <button
                      onClick={() => setMode("idle")}
                      className="flex cursor-pointer items-center justify-center gap-1.5 rounded-xl py-3 text-xs font-semibold border text-red-500 transition-all"
                      style={{
                        background: "var(--bg-2)",
                        borderColor: "var(--border)",
                      }}
                    >
                      Cancel mode
                    </button>
                  </div>
                </section>
              </>
            )}

            {/* Hospital Ranking List */}
            {mode === "active" && emergency && (
              <section
                className="rounded-2xl p-4 shadow-sm border max-h-64 overflow-y-auto slim-scroll"
                style={{
                  background: "var(--surface)",
                  borderColor: "var(--border)",
                }}
              >
                <SectionLabel>
                  Ranked Hospitals ({emergency.hospitals.length})
                </SectionLabel>
                <div className="mt-2 space-y-2">
                  {emergency.hospitals.map((h, i) => (
                    <div
                      key={h.id}
                      className="flex items-center justify-between rounded-xl p-2.5 border"
                      style={{
                        background: "var(--bg-2)",
                        borderColor: "var(--border)",
                      }}
                    >
                      <div>
                        <div
                          className="text-xs font-bold"
                          style={{ color: "var(--text)" }}
                        >
                          {i + 1}. {h.name}
                        </div>
                        <div
                          className="text-[10px]"
                          style={{ color: "var(--text-4)" }}
                        >
                          {h.distance_km.toFixed(1)} km · {h.eta_source}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-black text-red-500">
                          {h.eta_min} min
                        </div>
                        <div className="text-[9px] font-semibold text-green-500">
                          Fastest ETA
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
