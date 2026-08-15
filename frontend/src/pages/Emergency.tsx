import { useCallback, useEffect, useState } from "react";
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
import { DEFAULT_MAP_CENTER } from "../config";
import { useCountdown } from "../hooks/useCountdown";
import { useGeolocation } from "../hooks/useGeolocation";
import { api } from "../services/api";
import type { EmergencyResponse } from "../types";

type Mode = "idle" | "crash" | "active";

export function Emergency({ onGoDashboard }: { onGoDashboard: () => void }) {
  const [mode, setMode] = useState<Mode>("idle");
  const [emergency, setEmergency] = useState<EmergencyResponse | null>(null);
  const [activating, setActivating] = useState(false);
  const [sharing, setSharing] = useState<"ok" | "copied" | null>(null);
  const [recovered, setRecovered] = useState(false);
  const geo = useGeolocation();

  const location = geo.position ?? {
    lat: DEFAULT_MAP_CENTER[0],
    lon: DEFAULT_MAP_CENTER[1],
  };
  const countdown = useCountdown(emergency?.countdown_seconds ?? 60);

  useEffect(() => {
    if (mode === "active" && emergency)
      countdown.reset(emergency.countdown_seconds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, emergency?.activated_at]);

  const activate = useCallback(async () => {
    setActivating(true);
    try {
      const res = await api.activateEmergency(location.lat, location.lon);
      setEmergency(res);
      setMode("active");
      countdown.reset(res.countdown_seconds);
    } catch (e) {
      console.error(e);
    } finally {
      setActivating(false);
    }
  }, [location, countdown]);

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
                  ? "Response active — nearest hospitals ranked by road ETA."
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
            />
            {mode === "idle" && (
              <div className="absolute left-3 top-3 z-[1000] rounded-xl bg-white/95 px-3 py-2 text-xs font-semibold text-neutral-600 shadow">
                <MapPin size={11} className="mr-1 inline text-blue-500" />
                Your location{geo.position ? "" : " (demo location)"}
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
                  driver confirmation → emergency mode.
                </p>
              </section>
            )}

            {mode === "active" && emergency && (
              <>
                {/* countdown */}
                <section className="rounded-2xl border border-red-200 bg-white p-5 text-center shadow-sm">
                  <div className="rounded-xl bg-neutral-50 px-3 py-4 text-left">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-neutral-500">Nearest hospital</span>
                      <span className="font-bold text-neutral-900">
                        {emergency.hospitals[0]?.name ?? "—"}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-xs">
                      <span className="text-neutral-500">
                        Estimated road ETA
                      </span>
                      <span className="text-lg font-extrabold text-red-500">
                        {emergency.hospitals[0]?.eta_min} min
                      </span>
                    </div>
                  </div>
                </section>

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
                    : " · demo location (allow location for GPS)"}
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
                  Nearby hospitals — ranked by road ETA
                </SectionLabel>
                <p className="mt-0.5 text-[11px] text-neutral-400">
                  Road ETA beats raw distance: the fastest reachable care wins.
                </p>
              </div>
            </div>
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
                    <div className="truncate text-sm font-bold text-neutral-900">
                      {h.name}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-neutral-500">
                      <span className="text-sm font-extrabold text-neutral-900">
                        {h.eta_min} min
                      </span>
                      <span>ETA</span>
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
                          : "Estimated"}
                      </span>
                    </div>
                  </div>
                  {h.phone && (
                    <a
                      href={`tel:${h.phone}`}
                      title={`Call ${h.name}`}
                      className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full bg-neutral-900 text-white hover:bg-neutral-700"
                    >
                      <PhoneCall size={14} />
                    </a>
                  )}
                </li>
              ))}
            </ol>
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
                  }, 1800);
                }}
              >
                <CheckCircle2 size={16} /> I'M OK
              </PillButton>
              <PillButton
                variant="red"
                onClick={activate}
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
          </div>
        </div>
      )}

      {activating && (
        <div className="fixed inset-0 z-[1600] flex items-center justify-center bg-white/60 backdrop-blur-sm">
          <div className="flex items-center gap-3 rounded-2xl border border-neutral-200 bg-white px-6 py-4 shadow-xl">
            <Spinner className="h-5 w-5 text-red-500" />
            <span className="text-sm font-semibold text-neutral-700">
              Contacting nearby hospitals…
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
