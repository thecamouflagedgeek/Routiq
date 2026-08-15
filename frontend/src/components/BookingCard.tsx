import { useState } from 'react'
import { ArrowRight, Loader2, ShieldCheck } from 'lucide-react'
import type { RouteResponse } from '../types'
import { DataBadge, RiskBadge } from './ui'

interface Props {
  route: RouteResponse | null
  loading: boolean
  onPlanRoute: () => void
  onShowSegments: () => void
  expanded: boolean
}

export function BookingCard({ route, loading, onPlanRoute, onShowSegments, expanded }: Props) {
  const [showSafetyDetails, setShowSafetyDetails] = useState(false)


  return (
    <div className="w-[380px] max-w-full rounded-2xl border border-neutral-200/80 bg-white/95 p-4 shadow-[0_20px_50px_-15px_rgba(0,0,0,0.18)] backdrop-blur-md transition-all">
      {/* Top weather & status row */}
      {route && (
        <div className="mb-2.5 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-orange-100 text-[11px]">
              ✨
            </span>
            <span className="text-[11px] font-semibold text-neutral-500">Live NexRoad SafeRoute</span>
          </div>
          {route.weather && (
            <span
              title={`${route.weather.description} · ${route.weather.source === 'live' ? 'live weather' : 'demo weather'}`}
              className="inline-flex items-center gap-1 rounded-full border border-neutral-100 bg-neutral-50 px-2 py-0.5 text-[10px] font-semibold text-neutral-600"
            >
              {route.weather.main === 'Clear' ? '☀️' : route.weather.main === 'Rain' ? '🌧️' : '☁️'} {route.weather.temp_c}°C
            </span>
          )}
          <DataBadge source={route.source} />
        </div>
      )}

      {/* Main Stats Grid matching reference Uber card: DISTANCE | CHARGES / SAFETY | BOOK NOW */}
      <div className="flex items-center justify-between gap-3 bg-neutral-50/80 p-3 rounded-xl border border-neutral-100">
        <div>
          <div className="text-[10px] font-extrabold uppercase tracking-widest text-neutral-400">DISTANCE</div>
          <div className="mt-0.5 text-lg font-black text-neutral-900">
            {route ? `${route.distance_km.toFixed(1)} KM` : '3.2 KM'}
          </div>
        </div>

        <div>
          <div className="flex items-center gap-1">
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-neutral-400">DRIVE TIME</span>
            <button
              onClick={() => setShowSafetyDetails((v) => !v)}
              className="text-[9px] font-bold text-orange-600 underline cursor-pointer"
            >
              {showSafetyDetails ? 'Time' : 'Safety'}
            </button>
          </div>
          <div className="mt-0.5 text-lg font-black text-neutral-900">
            {showSafetyDetails && route ? (
              <span className="flex items-center gap-1 text-emerald-600">
                <ShieldCheck size={14} /> {route.overall_score}/100
              </span>
            ) : (
              route ? `${route.duration_min} min` : '48 min'
            )}
          </div>
        </div>

        <button
          onClick={route ? onShowSegments : onPlanRoute}
          disabled={loading}
          className="cursor-pointer rounded-xl bg-black px-5 py-3 text-xs font-black tracking-wider text-white shadow-md transition-all hover:bg-neutral-800 active:scale-95 disabled:opacity-60"
        >
          {loading ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            'DRIVE NOW'
          )}
        </button>
      </div>

      {/* Extended Safety Breakdown */}
      {route && (
        <div className="mt-3 flex items-center justify-between border-t border-neutral-100 pt-2.5 text-xs">
          <div className="flex items-center gap-2">
            <RiskBadge level={route.overall_risk} />
            <span className="text-[11px] text-neutral-500 font-medium">
              {route.duration_min} min drive · {route.segments.length} route segments
            </span>
          </div>

          <button
            onClick={onShowSegments}
            className="flex items-center gap-1 text-[11px] font-bold text-neutral-900 hover:text-orange-600 cursor-pointer"
          >
            {expanded ? 'Hide Details' : 'Details'} <ArrowRight size={12} />
          </button>
        </div>
      )}
    </div>
  )
}

