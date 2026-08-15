import { useMemo, useState } from "react";
import {
  ArrowRight,
  Clock,
  Loader2,
  Navigation,
  ShieldCheck,
} from "lucide-react";
import type { RouteResponse } from "../types";
import { RiskBadge } from "./ui";

interface Props {
  route: RouteResponse | null;
  loading: boolean;
  onPlanRoute: () => void;
  onShowSegments: () => void;
  expanded: boolean;
}

export function BookingCard({
  route,
  loading,
  onPlanRoute,
  onShowSegments,
  expanded,
}: Props) {
  const [showSafetyDetails, setShowSafetyDetails] = useState(false);

  const summary = useMemo(() => {
    if (!route) return "Planning a safer route…";

    const riskLabel =
      route.overall_risk === "SAFE"
        ? "Low Risk"
        : route.overall_risk === "MODERATE"
          ? "Moderate Safety"
          : route.overall_risk === "HIGH"
            ? "High Risk"
            : "Critical Risk";

    return `${route.distance_km.toFixed(1)} km · ${route.duration_min} min · ${riskLabel}`;
  }, [route]);

  return (
    <div className="fixed inset-x-0 bottom-0 z-[1050] border-t border-neutral-200 bg-white/95 px-3 pb-[max(env(safe-area-inset-bottom),1rem)] pt-3 shadow-[0_-20px_45px_-20px_rgba(0,0,0,0.18)] backdrop-blur-xl sm:px-4 md:inset-x-auto md:left-1/2 md:w-[420px] md:-translate-x-1/2 md:rounded-t-[28px] md:border md:border-neutral-200 md:px-4 md:pb-3 md:pt-3">
      <div className="mx-auto max-w-md">
        <div className="mb-2 flex items-center justify-center">
          <span className="h-1.5 w-12 rounded-full bg-neutral-200" />
        </div>

        {route?.weather && (
          <div className="mb-2 flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-[11px] font-semibold text-neutral-500">
              <Navigation size={12} className="text-blue-500" /> Best route
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-neutral-200 bg-neutral-50 px-2.5 py-0.5 text-[10px] font-semibold text-neutral-600">
              {route.weather.main === "Clear"
                ? "☀️"
                : route.weather.main === "Rain"
                  ? "🌧️"
                  : "☁️"}{" "}
              {route.weather.temp_c}°C
            </span>
          </div>
        )}

        <button
          type="button"
          onClick={route ? onShowSegments : onPlanRoute}
          disabled={!route && loading}
          className="w-full text-left"
        >
          <div className="flex items-center justify-between gap-2 sm:gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wider text-neutral-400">
                <Clock size={11} /> {route ? "Estimated time" : "Route"}
              </div>
              <div className="truncate text-sm font-black tracking-tight text-neutral-900 sm:text-base">
                {loading && !route ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 size={15} className="animate-spin" /> Finding safe
                    route…
                  </span>
                ) : (
                  summary
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {route && <ShieldCheck size={15} className="text-emerald-600" />}
              <ArrowRight size={16} className="text-neutral-500" />
            </div>
          </div>
        </button>

        {route && (
          <div className="mt-3 flex items-center justify-between gap-2 border-t border-neutral-100 pt-3">
            <div className="flex min-w-0 items-center gap-2">
              <RiskBadge level={route.overall_risk} />
              <span className="truncate text-[11px] font-medium text-neutral-500">
                {route.segments.length} segments · score {route.overall_score}
                /100
              </span>
            </div>

            <div className="flex shrink-0 items-center gap-3">
              <button
                type="button"
                onClick={() => setShowSafetyDetails((v) => !v)}
                className="text-[11px] font-bold text-orange-600 hover:underline"
              >
                {showSafetyDetails ? "Hide score" : "Safety score"}
              </button>
              <button
                type="button"
                onClick={onShowSegments}
                className="text-[11px] font-bold text-neutral-900 hover:text-orange-600"
              >
                {expanded ? "Hide" : "Details"}
              </button>
            </div>
          </div>
        )}

        {showSafetyDetails && route && (
          <div
            className="mt-2 flex items-center justify-between rounded-lg p-2 text-xs font-semibold"
            style={{ background: "rgba(34,197,94,0.08)", color: "#22c55e" }}
          >
            <span>Route safety rating</span>
            <span className="text-sm font-black">
              {route.overall_score}/100
            </span>
          </div>
        )}

        {!route && !loading && (
          <button
            type="button"
            onClick={onPlanRoute}
            className="mt-3 flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-neutral-900 px-4 py-3 text-sm font-black text-white"
          >
            Find safe route
          </button>
        )}
      </div>
    </div>
  );
}
