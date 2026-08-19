import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  List,
  MapPin,
  MapPinned,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Route,
  Thermometer,
} from "lucide-react";
import L from "leaflet";
import { HazardForm } from "../components/HazardForm";
import { MapView } from "../components/map/MapView";
import { PlaceAutocomplete } from "../components/PlaceAutocomplete";
import { SavedPlaces } from "../components/SavedPlaces";
import { SegmentPanel } from "../components/SegmentPanel";
import { RiskBadge, SectionLabel } from "../components/ui";
import {
  DEFAULT_END,
  DEFAULT_START,
  RISK_META,
  SEVERITY_META,
} from "../config";
import { useFatigue } from "../hooks/useFatigue";
import { useGeolocation } from "../hooks/useGeolocation";
import { useSimulation } from "../hooks/useSimulation";
import { api } from "../services/api";
import type {
  Hazard,
  HazardType,
  Place,
  RiskLevel,
  RouteResponse,
  Segment,
} from "../types";

type PickMode = "start" | "end" | "hazard" | null;

/* ------------------------------------------------------------------ *
 * Mockup palette (reference design)
 * ------------------------------------------------------------------ */
const C = {
  sidebar: "#14171f",
  card: "#1a1e27",
  pill: "#1e222b",
  border: "rgba(255,255,255,0.08)",
  borderStrong: "rgba(255,255,255,0.12)",
  text: "#ffffff",
  muted: "#8b93a3",
  faint: "#5d6472",
  orange: "#ff6600",
  blue: "#3b82f6",
  purple: "#8b5cf6",
  yellow: "#facc15",
};

/* ================================================================== *
 *  Pre-drive planning content (shared by the desktop sidebar and the
 *  mobile bottom sheet so both stay pixel-identical)
 * ================================================================== */
function PlanningContent({
  start,
  end,
  route,
  loading,
  hazards,
  compact,
  onStartSelect,
  onEndSelect,
  onUseMyLocation,
  onPickOnMap,
  pickingStart,
  pickingEnd,
  onStartDemo,
  onToggleSegments,
  onReportHazard,
  onSelectSavedPlace,
}: {
  start: Place | null;
  end: Place | null;
  route: RouteResponse | null;
  loading: boolean;
  hazards: Hazard[];
  compact?: boolean;
  onStartSelect: (p: Place) => void;
  onEndSelect: (p: Place) => void;
  onUseMyLocation: (which: "start" | "end") => void;
  onPickOnMap: (which: "start" | "end") => void;
  pickingStart: boolean;
  pickingEnd: boolean;
  onStartDemo: () => void;
  onToggleSegments: () => void;
  onReportHazard: () => void;
  onSelectSavedPlace: (p: Place) => void;
}) {
  const [showSafety, setShowSafety] = useState(false);

  const riskColor = route ? RISK_META[route.overall_risk].color : C.yellow;
  const riskLabel = route ? RISK_META[route.overall_risk].label : "MODERATE";
  const temp =
    route?.weather?.temp_c != null ? `${route.weather.temp_c.toFixed(1)}°C` : null;

  return (
    <div className="space-y-3 md:space-y-3.5">
      {/* 1. Hero */}
      <div>
        <h1
          className={
            compact
              ? "text-lg font-black leading-[1.15] tracking-tight text-white"
              : "text-[26px] font-black leading-[1.12] tracking-tight text-white"
          }
        >
          Know the road.
          <br />
          <span style={{ color: C.orange }}>Before you drive it.</span>
        </h1>
        <p className="mt-1 text-[11px] font-medium leading-relaxed md:mt-1.5 md:text-xs" style={{ color: C.muted }}>
          Segment-level safety scores. Real-time driver monitoring. Contextual
          risk fusion.
        </p>
      </div>

      {/* 2. START DEMO DRIVE */}
      {route && (
        <button
          onClick={onStartDemo}
          disabled={loading}
          className="flex w-full cursor-pointer items-center justify-center gap-2.5 rounded-2xl py-3 text-sm font-black text-white transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50 md:gap-3 md:py-3.5"
          style={{
            background: C.orange,
            boxShadow: "0 8px 24px rgba(255,102,0,0.35)",
          }}
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/20">
            <Play size={13} fill="white" />
          </span>
          START DEMO DRIVE
        </button>
      )}

      {/* 3. Route summary card */}
      <div
        className="rounded-2xl p-3 md:p-4"
        style={{ background: C.card, border: `1px solid ${C.border}` }}
      >
        {/* top row — Best Route + temperature */}
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-sm font-bold text-white">
            <span
              className="flex h-6 w-6 items-center justify-center rounded-md"
              style={{ background: "rgba(59,130,246,0.16)" }}
            >
              <Route size={14} style={{ color: C.blue }} />
            </span>
            Best Route
          </span>
          {temp && (
            <span className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: C.muted }}>
              <Thermometer size={13} />
              {temp}
            </span>
          )}
        </div>

        {/* stats */}
        <div className="mt-2.5 grid grid-cols-2 gap-2.5 md:mt-3.5 md:gap-3">
          <div>
            <div
              className="text-[10px] font-extrabold uppercase tracking-[0.14em]"
              style={{ color: C.faint }}
            >
              Estimated time
            </div>
            <div className="mt-0.5 text-xl font-black leading-none text-white md:text-2xl">
              {route ? `${route.duration_min.toFixed(1)} min` : "--"}
            </div>
          </div>
          <div>
            <div
              className="text-[10px] font-extrabold uppercase tracking-[0.14em]"
              style={{ color: C.faint }}
            >
              Distance
            </div>
            <div className="mt-0.5 text-xl font-black leading-none text-white md:text-2xl">
              {route ? `${route.distance_km.toFixed(1)} km` : "--"}
            </div>
          </div>
        </div>

        {/* sub row */}
        <div className="mt-2 flex items-center justify-between text-[11px] font-medium md:mt-3" style={{ color: C.muted }}>
          <span>
            {route ? `Fastest route · ${route.segments.length} segments` : "Planning a safer route…"}
          </span>
          {route && (
            <button
              onClick={() => setShowSafety((v) => !v)}
              className="cursor-pointer font-bold transition-colors hover:text-white"
              style={{ color: C.muted }}
            >
              Safety Score
            </button>
          )}
        </div>

        {showSafety && route && (
          <div
            className="mt-2 flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs font-bold"
            style={{
              background: "rgba(255,102,0,0.10)",
              color: C.orange,
              border: "1px solid rgba(255,102,0,0.25)",
            }}
          >
            <span>Route safety rating</span>
            <span className="text-sm font-black">
              {route.overall_score}/100
            </span>
          </div>
        )}

        {/* bottom row — risk + details */}
        <div
          className="mt-2.5 flex items-center justify-between border-t pt-2.5 md:mt-3 md:pt-3"
          style={{ borderColor: "rgba(255,255,255,0.07)" }}
        >
          <span className="flex items-center gap-1.5 text-xs font-black tracking-wide" style={{ color: riskColor }}>
            <span className="h-2 w-2 rounded-full" style={{ background: riskColor }} />
            {riskLabel}
          </span>
          <button
            onClick={onToggleSegments}
            className="flex cursor-pointer items-center gap-1 text-xs font-bold transition-colors"
            style={{ color: "#c7ccd6" }}
          >
            Details
            <ArrowRight size={13} />
          </button>
        </div>
      </div>

      {/* 4. Location inputs */}
      <div className="space-y-2 md:space-y-2.5">
        <PlaceAutocomplete
          value={start}
          placeholder="Start — e.g. Bandra West"
          variant="start"
          onSelect={onStartSelect}
          onUseMyLocation={() => onUseMyLocation("start")}
          onPickOnMap={() => onPickOnMap("start")}
          picking={pickingStart}
        />
        <PlaceAutocomplete
          value={end}
          placeholder="Destination — e.g. Malad West"
          variant="end"
          onSelect={onEndSelect}
          onUseMyLocation={() => onUseMyLocation("end")}
          onPickOnMap={() => onPickOnMap("end")}
          picking={pickingEnd}
        />
      </div>

      {/* 5. Saved places */}
      <SavedPlaces onSelectPlace={onSelectSavedPlace} />

      {/* 6. Live road hazards */}
      {hazards.length > 0 && (
        <div
          className="rounded-2xl p-3 md:p-3.5"
          style={{ background: C.card, border: `1px solid ${C.border}` }}
        >
          <div className="mb-2 flex items-center justify-between">
            <span
              className="text-[10px] font-extrabold uppercase tracking-widest"
              style={{ color: C.faint }}
            >
              Live road hazards
            </span>
            <button
              onClick={onReportHazard}
              className="flex cursor-pointer items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold transition-colors hover:opacity-80"
              style={{
                background: C.pill,
                color: "#c7ccd6",
                border: `1px solid ${C.border}`,
              }}
            >
              <Plus size={12} /> Report
            </button>
          </div>
          <ul className="space-y-1.5">
            {hazards.slice(0, 3).map((h) => (
              <li
                key={h.id}
                className="flex items-center justify-between gap-2 text-xs"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: SEVERITY_META[h.severity].color }}
                  />
                  <span className="truncate font-semibold text-white">
                    {h.description}
                  </span>
                  {h.source === "user" && (
                    <span
                      className="rounded px-1.5 py-0.5 text-[9px] font-extrabold text-white"
                      style={{ background: C.text }}
                    >
                      YOU
                    </span>
                  )}
                </span>
                <span
                  className="shrink-0 text-[10px] font-medium"
                  style={{ color: C.faint }}
                >
                  {h.distance_m != null ? `${Math.round(h.distance_m)} m` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ================================================================== */
export function Dashboard({
  initialReport = false,
  dark,
  onOpenEmergency,
  showPlanning = false,
}: {
  onOpenEmergency: () => void;
  initialReport?: boolean;
  dark?: boolean;
  showPlanning?: boolean;
}) {
  const [start, setStart] = useState<Place | null>(DEFAULT_START);
  const [end, setEnd] = useState<Place | null>(DEFAULT_END);
  const [route, setRoute] = useState<RouteResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Segment | null>(null);
  const [hazards, setHazards] = useState<Hazard[]>([]);
  const [showList, setShowList] = useState(false);
  const [pickMode, setPickMode] = useState<PickMode>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportLocation, setReportLocation] = useState<{
    lat: number;
    lon: number;
  } | null>(null);
  const [reportPreset, setReportPreset] = useState<
    { type?: HazardType } | undefined
  >(undefined);
  const [fullscreen, setFullscreen] = useState(false);
  const [riskAlert, setRiskAlert] = useState<Segment | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const geo = useGeolocation();

  // last segment's risk level, to detect route colour changes mid-drive
  const prevRiskRef = useRef<RiskLevel | null>(null);
  // WebAudio context for the ping notification (created on a user gesture)
  const audioRef = useRef<AudioContext | null>(null);

  const ensureAudio = useCallback(() => {
    try {
      if (!audioRef.current) {
        const Ctor =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext;
        if (Ctor) audioRef.current = new Ctor();
      }
      if (audioRef.current?.state === "suspended") {
        audioRef.current.resume().catch(() => {});
      }
    } catch {
      /* audio unavailable — visual notification still shows */
    }
  }, []);

  const playPing = useCallback(() => {
    try {
      const ctx = audioRef.current;
      if (!ctx) return;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.exponentialRampToValueAtTime(1318.5, now + 0.09);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.18, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.45);
    } catch {
      /* noop */
    }
  }, []);

  // ── simulation ──────────────────────────────────────────────────────────
  const {
    sim,
    start: simStart,
    pause: simPause,
    resume: simResume,
    reset: simReset,
  } = useSimulation(route);
  const isSimulating = sim.phase === "running" || sim.phase === "paused";

  // ── risk ping: as soon as the route colour changes (new segment risk
  // level), fire a popup + notification showing that road's score ──────
  useEffect(() => {
    if (!isSimulating) {
      prevRiskRef.current = null;
      return;
    }
    const seg = sim.currentSegment;
    if (!seg) return;
    if (prevRiskRef.current != null && seg.risk_level !== prevRiskRef.current) {
      setRiskAlert(seg);
      playPing();
    }
    prevRiskRef.current = seg.risk_level;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally reacts only when the segment id changes
  }, [sim.currentSegment?.id, sim.phase, isSimulating, playPing]);

  // auto-dismiss the risk popup after 7s
  useEffect(() => {
    if (!riskAlert) return;
    const t = setTimeout(() => setRiskAlert(null), 7000);
    return () => clearTimeout(t);
  }, [riskAlert]);

  // clear the popup when the drive ends
  useEffect(() => {
    if (sim.phase === "finished" || sim.phase === "idle") {
      setRiskAlert(null);
    }
  }, [sim.phase]);

  // ── fatigue (Sleep Drive running in background during sim) ───────────────
  const fatigue = useFatigue();

  // auto-start/stop fatigue with simulation
  useEffect(() => {
    if (sim.phase === "running" && fatigue.phase === "idle") {
      fatigue.start();
    }
    if (sim.phase === "idle" && fatigue.phase !== "idle") {
      fatigue.stop();
    }
  }, [sim.phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── route loading ────────────────────────────────────────────────────────
  const loadRoute = useCallback(async (s: Place, e: Place) => {
    setLoading(true);
    setSelected(null);
    setShowList(false);
    simReset();
    try {
      const r = await api.getRoute([s.lat, s.lon], [e.lat, e.lon]);
      setRoute(r);
      const mid = r.geometry[Math.floor(r.geometry.length / 2)];
      const hz = await api.getHazards(mid[0], mid[1], 3000, 8);
      setHazards(hz);
    } catch (err) {
      console.error("route failed", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRoute(DEFAULT_START, DEFAULT_END);
  }, [loadRoute]);

  useEffect(() => {
    if (initialReport) {
      openHazardForm();
      window.history.replaceState(null, "", "#/dashboard");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialReport]);

  const onPickMapLocation = useCallback(
    async (lat: number, lon: number) => {
      if (pickMode === "start" || pickMode === "end") {
        let label = `Pinned (${lat.toFixed(4)}, ${lon.toFixed(4)})`;
        let sublabel = "Map location";
        try {
          const rev = await api.reverseGeocode(lat, lon);
          if (rev?.formattedAddress) {
            label = rev.name || rev.formattedAddress;
            sublabel = rev.formattedAddress;
          }
        } catch (e) {
          console.error("Reverse geocode error:", e);
        }
        const place: Place = {
          label,
          sublabel,
          lat,
          lon,
          city: "Mumbai",
          formattedAddress: sublabel,
        };
        if (pickMode === "start") {
          setStart(place);
          if (end) loadRoute(place, end);
        } else {
          setEnd(place);
          if (start) loadRoute(start, place);
        }
        setPickMode(null);
      } else if (pickMode === "hazard") {
        setReportLocation({ lat, lon });
        setPickMode(null);
        setReportOpen(true);
      }
    },
    [pickMode, end, start, loadRoute],
  );

  const useMyLocationForPlace = useCallback(
    async (which: "start" | "end") => {
      const fix = await geo.getPosition();
      if (!fix) return;
      let label = "My location";
      let sublabel = "Current GPS position";
      try {
        const rev = await api.reverseGeocode(fix.lat, fix.lon);
        if (rev?.formattedAddress) {
          label = rev.name || "My location";
          sublabel = rev.formattedAddress;
        }
      } catch (e) {
        console.error("Reverse geocode error:", e);
      }
      const place: Place = {
        label,
        sublabel,
        lat: fix.lat,
        lon: fix.lon,
        city: "Mumbai",
        formattedAddress: sublabel,
      };
      if (which === "start") {
        setStart(place);
        if (end) loadRoute(place, end);
      } else {
        setEnd(place);
        if (start) loadRoute(start, place);
      }
    },
    [geo, end, start, loadRoute],
  );

  const openHazardForm = useCallback(
    (opts?: {
      lat?: number;
      lon?: number;
      type?: HazardType;
      segment?: Segment;
    }) => {
      setReportPreset(opts?.type ? { type: opts.type } : undefined);
      if (opts?.lat != null && opts?.lon != null)
        setReportLocation({ lat: opts.lat, lon: opts.lon });
      else setReportLocation(null);
      setReportOpen(true);
    },
    [],
  );

  const onSubmitted = useCallback((h: Hazard) => {
    setHazards((prev) => [h, ...prev.filter((x) => x.id !== h.id)]);
  }, []);

  const worst = useMemo(() => {
    if (!route?.segments.length) return null;
    return [...route.segments].sort(
      (a, b) => a.safety_score - b.safety_score,
    )[0];
  }, [route]);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
      setFullscreen(false);
    } else {
      document.documentElement.requestFullscreen().catch(() => {});
      setFullscreen(true);
    }
  }, []);

  const segments = route?.segments ?? [];

  // ── start demo ──────────────────────────────────────────────────────────
  const handleStartDemo = useCallback(() => {
    if (!route) return;
    setSelected(null);
    setShowList(false);
    setRiskAlert(null);
    ensureAudio(); // unlock audio for the ping notification (user gesture)
    simStart();
  }, [route, simStart, ensureAudio]);

  const planningProps = {
    start,
    end,
    route,
    loading,
    hazards,
    onStartSelect: (p: Place) => {
      setStart(p);
      if (end) loadRoute(p, end);
    },
    onEndSelect: (p: Place) => {
      setEnd(p);
      if (start) loadRoute(start, p);
    },
    onUseMyLocation: useMyLocationForPlace,
    onPickOnMap: (which: "start" | "end") => setPickMode(which),
    pickingStart: pickMode === "start",
    pickingEnd: pickMode === "end",
    onStartDemo: handleStartDemo,
    onToggleSegments: () => {
      setShowList((v) => !v);
      setSelected(null);
    },
    onReportHazard: () => openHazardForm(),
    onSelectSavedPlace: (place: Place) => {
      setEnd(place);
      if (start) loadRoute(start, place);
    },
  };

  return (
    <div
      className="relative h-screen w-full overflow-hidden"
      style={{ background: "var(--bg-2)" }}
    >
      {/* ── Map (full viewport; sidebar overlays on desktop) ── */}
      <div className="absolute inset-0 z-0">
        <MapView
          route={route}
          hazards={hazards}
          selectedSegment={selected}
          vehiclePosition={sim.position}
          currentSegmentId={sim.currentSegment?.id ?? null}
          onSelectSegment={(s) => {
            if (!isSimulating) {
              setSelected(s);
              setShowList(false);
            }
          }}
          hazardPickMode={pickMode === "hazard"}
          onPickLocation={onPickMapLocation}
          onReady={(m) => {
            mapRef.current = m;
          }}
          onFullscreen={toggleFullscreen}
          isFullscreen={fullscreen}
          startLabel={start?.name ?? start?.label ?? "Start"}
          endLabel={end?.name ?? end?.label ?? "Destination"}
          dark={dark}
        />
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          Brand pill — always visible on the map (even when planning is hidden)
      ═══════════════════════════════════════════════════════════════════ */}
      {!isSimulating && sim.phase !== "finished" && (
        <div
          className="absolute top-4 z-[1100] hidden -translate-x-1/2 items-center gap-2.5 rounded-2xl px-5 py-2 shadow-2xl backdrop-blur-md md:flex"
          style={{
            left: showPlanning ? "calc(50% + 180px)" : "50%",
            background: C.pill,
            border: `1px solid ${C.borderStrong}`,
            transition: "left 0.3s ease",
          }}
        >
          <img
            src={dark ? "/routiqinverted.png" : "/routiqlogo.png"}
            alt="Routiq"
            className="h-9 w-[132px] object-cover"
            style={{ objectPosition: "center 51%" }}
          />
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          DESKTOP LEFT SIDEBAR — mockup planning panel (only when Navigate is active)
      ═══════════════════════════════════════════════════════════════════ */}
      {!isSimulating && sim.phase !== "finished" && showPlanning && (
        <aside
          className="absolute inset-y-0 left-0 z-[1050] hidden w-[360px] flex-col overflow-hidden md:flex lg:w-[400px]"
          style={{
            background: C.sidebar,
            borderRight: `1px solid ${C.border}`,
            boxShadow: "20px 0 60px rgba(0,0,0,0.45)",
          }}
        >
          <div className="slim-scroll scrollbar-hide flex-1 overflow-y-auto p-5">
            <PlanningContent {...planningProps} />
          </div>
        </aside>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          MOBILE BOTTOM SHEET (same content, Uber-style) — only when Navigate is active
      ═══════════════════════════════════════════════════════════════════ */}
      {!isSimulating && sim.phase !== "finished" && showPlanning && (
        <div
          className="fixed inset-x-3 bottom-[76px] z-[1050] max-h-[55vh] overflow-y-auto rounded-3xl p-3 md:p-3.5 slim-scroll md:hidden"
          style={{
            background: "rgba(20,23,31,0.92)",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
            border: `1px solid ${C.borderStrong}`,
            boxShadow: "0 -12px 40px rgba(0,0,0,0.5)",
          }}
        >
          <div className="mb-2 flex justify-center">
            <span
              className="h-1.5 w-12 rounded-full"
              style={{ background: "rgba(255,255,255,0.2)" }}
            />
          </div>
          <PlanningContent {...planningProps} compact />
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          Simulation controls bar (top centre, during sim)
      ═══════════════════════════════════════════════════════════════════ */}
      {isSimulating && (
        <div className="absolute left-1/2 top-16 z-[1060] -translate-x-1/2 md:top-20">
          <div
            className="flex flex-wrap items-center justify-center gap-1.5 rounded-2xl px-3 py-2 shadow-xl md:gap-2 md:px-4 md:py-2.5"
            style={{
              background: C.pill,
              border: `1px solid ${C.borderStrong}`,
            }}
          >
            <span
              className="flex items-center gap-1.5 text-xs font-bold"
              style={{ color: C.orange }}
            >
              <span
                className="h-2 w-2 rounded-full pulse-dot"
                style={{ background: C.orange }}
              />
              LIVE DEMO
            </span>
            <div className="h-4 w-px" style={{ background: C.border }} />
            <span
              className="text-xs font-semibold"
              style={{ color: C.muted }}
            >
              {Math.round(sim.progress * 100)}% · ETA{" "}
              {route
                ? `${Math.max(
                    0,
                    route.duration_min * (1 - sim.progress),
                  ).toFixed(1)} min`
                : "--"}
            </span>
            <div className="h-4 w-px" style={{ background: C.border }} />
            {sim.phase === "running" ? (
              <button
                onClick={simPause}
                className="flex cursor-pointer items-center gap-1 rounded-full px-3 py-1 text-xs font-bold transition-colors"
                style={{ background: C.card, color: "#fff" }}
              >
                <Pause size={12} /> Pause
              </button>
            ) : (
              <button
                onClick={simResume}
                className="flex cursor-pointer items-center gap-1 rounded-full px-3 py-1 text-xs font-bold transition-colors"
                style={{ background: C.orange, color: "#fff" }}
              >
                <Play size={12} /> Resume
              </button>
            )}
            <button
              onClick={() => {
                simReset();
                fatigue.stop();
              }}
              className="flex cursor-pointer items-center gap-1 rounded-full px-3 py-1 text-xs font-bold transition-colors"
              style={{ background: C.card, color: C.muted }}
            >
              <RotateCcw size={12} /> Stop
            </button>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          Risk-change ping notification (fires when the route colour changes)
      ═══════════════════════════════════════════════════════════════════ */}
      {riskAlert && (
        <button
          onClick={() => {
            setSelected(riskAlert);
            setRiskAlert(null);
          }}
          className="slide-in-up absolute right-2 top-20 z-[1100] w-[calc(100%-1rem)] max-w-[320px] cursor-pointer overflow-hidden rounded-xl text-left shadow-2xl transition-transform hover:scale-[1.02] active:scale-[0.99] md:right-3 md:top-36 md:max-w-[340px] md:rounded-2xl"
          style={{
            background: C.pill,
            border: `1px solid ${RISK_META[riskAlert.risk_level].color}66`,
            boxShadow: `0 14px 44px rgba(0,0,0,0.65), 0 0 0 1px ${RISK_META[riskAlert.risk_level].color}22`,
          }}
        >
          <div className="flex items-center justify-between px-4 pt-3">
            <span
              className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-widest"
              style={{ color: RISK_META[riskAlert.risk_level].color }}
            >
              <AlertTriangle size={12} /> New road ahead
            </span>
            <span className="text-[10px] font-medium" style={{ color: C.faint }}>
              ping · just now
            </span>
          </div>
          <div className="flex items-center justify-between gap-3 px-4 pb-2.5 pt-2">
            <div className="min-w-0">
              <div className="truncate text-sm font-bold text-white">
                {riskAlert.name}
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <RiskBadge level={riskAlert.risk_level} />
            <span className="text-[10px] font-medium hidden sm:inline" style={{ color: C.faint }}>
              {riskAlert.distance_km.toFixed(1)} km
            </span>
              </div>
            </div>
            <div className="flex shrink-0 flex-col items-end">
              <span
                className="text-3xl font-black leading-none"
                style={{ color: RISK_META[riskAlert.risk_level].color }}
              >
                {riskAlert.safety_score}
              </span>
              <span className="mt-0.5 text-[10px] font-semibold" style={{ color: C.faint }}>
                / 100
              </span>
            </div>
          </div>
          <div
            className="flex items-center justify-center gap-1 py-2 text-[11px] font-bold text-white"
            style={{ background: `${RISK_META[riskAlert.risk_level].color}1f` }}
          >
            Tap for breakdown &amp; explanation <ArrowRight size={12} />
          </div>
        </button>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          Finished state
      ═══════════════════════════════════════════════════════════════════ */}
      {sim.phase === "finished" && (
        <div className="absolute inset-0 z-[1200] flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div
            className="w-72 rounded-2xl p-6 text-center shadow-2xl md:w-80 md:rounded-3xl md:p-8"
            style={{
              background: C.pill,
              border: `1px solid ${C.borderStrong}`,
            }}
          >
            <div className="mb-3 text-4xl">🏁</div>
            <h2 className="text-xl font-black text-white">Drive Complete</h2>
            <p className="mt-1 text-sm" style={{ color: C.muted }}>
              Route of {route?.distance_km.toFixed(1)} km · Safety:{" "}
              {route?.overall_score}/100
            </p>
            <div className="mt-5 flex gap-2">
              <button
                onClick={() => {
                  simReset();
                  fatigue.stop();
                }}
                className="flex-1 cursor-pointer rounded-2xl py-3 text-sm font-bold text-white transition-opacity hover:opacity-90"
                style={{ background: C.orange }}
              >
                <RotateCcw size={14} className="mr-1 inline" />
                Reset
              </button>
              <button
                onClick={onOpenEmergency}
                className="flex-1 cursor-pointer rounded-2xl py-3 text-sm font-bold text-white transition-opacity hover:opacity-90"
                style={{ background: "#dc2626" }}
              >
                🚨 Emergency
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          Route segment list drawer (pre-drive)
      ═══════════════════════════════════════════════════════════════════ */}
      {showList && route && !isSimulating && (
        <aside
          className="slide-in-right absolute bottom-20 right-2 top-14 z-[1050] flex w-[calc(100%-1rem)] max-w-[340px] flex-col overflow-hidden rounded-xl shadow-2xl md:bottom-24 md:right-4 md:top-16 md:w-[320px] md:rounded-2xl"
          style={{
            background: C.pill,
            border: `1px solid ${C.borderStrong}`,
          }}
        >
          <div
            className="flex items-center justify-between p-4"
            style={{ borderBottom: `1px solid ${C.border}` }}
          >
            <div className="flex items-center gap-2">
              <List size={16} style={{ color: C.muted }} />
              <SectionLabel>Route breakdown</SectionLabel>
            </div>
            <button
              onClick={() => setShowList(false)}
              className="cursor-pointer"
              style={{ color: C.faint }}
            >
              <ArrowRight size={16} className="rotate-180" />
            </button>
          </div>
          <div className="slim-scroll flex-1 overflow-y-auto p-2">
            {segments.map((seg, i) => (
              <button
                key={seg.id}
                onClick={() => {
                  setSelected(seg);
                  setShowList(false);
                }}
                className="flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-white/5"
              >
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-black text-white"
                  style={{ backgroundColor: seg.risk_color }}
                >
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-white">
                    {seg.name}
                  </span>
                  <span
                    className="block text-[11px] font-semibold"
                    style={{ color: C.faint }}
                  >
                    {seg.distance_km.toFixed(1)} km
                  </span>
                </span>
                <span
                  className="text-sm font-black"
                  style={{ color: seg.risk_color }}
                >
                  {seg.safety_score}
                </span>
              </button>
            ))}
          </div>
          {worst && (
            <div
              className="p-3"
              style={{ borderTop: `1px solid ${C.border}` }}
            >
              <div
                className="rounded-xl p-3"
                style={{
                  background: "rgba(239,68,68,0.08)",
                  border: "1px solid rgba(239,68,68,0.25)",
                }}
              >
                <div className="text-[10px] font-extrabold uppercase tracking-widest text-red-500">
                  Most dangerous segment
                </div>
                <div className="mt-0.5 flex items-center justify-between">
                  <span className="text-xs font-bold text-white">
                    {worst.name}
                  </span>
                  <span className="text-lg font-black text-red-500">
                    {worst.safety_score}
                  </span>
                </div>
                <button
                  onClick={() => {
                    setSelected(worst);
                    setShowList(false);
                  }}
                  className="mt-2 flex w-full cursor-pointer items-center justify-center gap-1 rounded-lg bg-red-500 py-1.5 text-xs font-bold text-white hover:bg-red-600"
                >
                  <MapPinned size={13} /> Inspect Segment Risk
                </button>
              </div>
            </div>
          )}
        </aside>
      )}

      {/* Segment panel (pre-drive, or opened from the mid-drive risk popup) */}
      {selected && (
        <SegmentPanel
          segment={selected}
          onClose={() => setSelected(null)}
          onReportHazard={(seg) => {
            const mid = seg.geometry[Math.floor(seg.geometry.length / 2)];
            openHazardForm({ lat: mid[0], lon: mid[1] });
          }}
        />
      )}

      {/* Hazard report modal */}
      <HazardForm
        key={`${reportOpen}-${reportPreset?.type ?? "none"}`}
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        defaultLocation={reportLocation}
        preset={reportPreset}
        picking={pickMode === "hazard"}
        onPickFromMap={() => {
          setReportOpen(false);
          setPickMode("hazard");
        }}
        onUseMyLocation={async () => {
          const fix = await geo.getPosition();
          if (fix) setReportLocation({ lat: fix.lat, lon: fix.lon });
        }}
        onSubmitted={onSubmitted}
      />

      {pickMode === "hazard" && (
        <div className="absolute bottom-6 left-1/2 z-[1060] -translate-x-1/2">
          <div
            className="flex items-center gap-2 rounded-full px-5 py-3 text-xs font-bold text-white shadow-2xl"
            style={{ background: C.text }}
          >
            <MapPin size={14} style={{ color: C.orange }} />
            Click on the map to place hazard
            <button
              onClick={() => setPickMode(null)}
              className="ml-2 cursor-pointer rounded-full px-2.5 py-0.5 text-[10px]"
              style={{ background: "rgba(255,255,255,0.15)" }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
