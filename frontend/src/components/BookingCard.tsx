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
    <div
      className="w-full rounded-2xl p-4 transition-all"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        boxShadow: 'var(--shadow-lg)',
      }}
    >
      {/* Top status row */}
      {route && (
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="flex h-5 w-5 items-center justify-center rounded-full" style={{ background: 'rgba(249,115,22,0.12)' }}>
              <ShieldCheck size={11} style={{ color: 'var(--orange)' }} />
            </span>
            <span className="text-[11px] font-semibold" style={{ color: 'var(--text-3)' }}>Routiq SafeRoute</span>
          </div>
          <div className="flex items-center gap-1.5">
            {route.weather && (
              <span
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                style={{ border: '1px solid var(--border)', background: 'var(--bg-2)', color: 'var(--text-3)' }}
              >
                {route.weather.main === 'Clear' ? '☀️' : route.weather.main === 'Rain' ? '🌧️' : '☁️'} {route.weather.temp_c}°C
              </span>
            )}
            <DataBadge source={route.source} />
          </div>
        </div>
      )}

      {/* Stats row */}
      <div
        className="grid grid-cols-2 gap-3 rounded-xl p-3"
        style={{ background: 'var(--bg-2)', border: '1px solid var(--border-2)' }}
      >
        <div>
          <div className="text-[10px] font-extrabold uppercase tracking-widest" style={{ color: 'var(--text-4)' }}>Distance</div>
          <div className="mt-0.5 text-lg font-black" style={{ color: 'var(--text)' }}>
            {route ? `${route.distance_km.toFixed(1)} km` : '— km'}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold uppercase tracking-widest" style={{ color: 'var(--text-4)' }}>
              {showSafetyDetails ? 'Safety' : 'Time'}
            </span>
            <button
              onClick={() => setShowSafetyDetails((v) => !v)}
              className="text-[9px] font-bold cursor-pointer hover:underline"
              style={{ color: 'var(--orange)' }}
            >
              {showSafetyDetails ? '← Time' : 'Safety →'}
            </button>
          </div>
          <div className="mt-0.5 text-lg font-black" style={{ color: 'var(--text)' }}>
            {showSafetyDetails && route ? (
              <span className="flex items-center gap-1 text-emerald-500">
                <ShieldCheck size={14} /> {route.overall_score}/100
              </span>
            ) : (
              route ? `${route.duration_min} min` : '— min'
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      {route && (
        <div className="mt-3 flex items-center justify-between" style={{ borderTop: '1px solid var(--border)', paddingTop: '10px' }}>
          <div className="flex items-center gap-2">
            <RiskBadge level={route.overall_risk} />
            <span className="text-[11px] font-medium" style={{ color: 'var(--text-3)' }}>
              {route.duration_min} min · {route.segments.length} segments
            </span>
          </div>
          <button
            onClick={onShowSegments}
            className="flex items-center gap-1 text-[11px] font-bold cursor-pointer transition-colors"
            style={{ color: 'var(--text-2)' }}
          >
            {expanded ? 'Hide' : 'Details'} <ArrowRight size={12} />
          </button>
        </div>
      )}
    </div>
  )
}
