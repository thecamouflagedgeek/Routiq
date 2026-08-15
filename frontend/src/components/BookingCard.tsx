import { useState } from 'react'
import { ArrowRight, Clock, Navigation } from 'lucide-react'
import type { RouteResponse } from '../types'
import { RiskBadge } from './ui'

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
      {/* Top weather row (if weather exists) */}
      {route?.weather && (
        <div className="mb-3 flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: 'var(--text-3)' }}>
            <Navigation size={13} className="text-blue-500" /> Best Route
          </span>
          <span
            className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-semibold"
            style={{ border: '1px solid var(--border)', background: 'var(--bg-2)', color: 'var(--text-3)' }}
          >
            {route.weather.main === 'Clear' ? '☀️' : route.weather.main === 'Rain' ? '🌧️' : '☁️'} {route.weather.temp_c}°C
          </span>
        </div>
      )}

      {/* Google Maps Style Route Stats Card */}
      <div
        className="rounded-xl p-3.5"
        style={{ background: 'var(--bg-2)', border: '1px solid var(--border-2)' }}
      >
        <div className="flex items-baseline justify-between">
          <div>
            <div className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wider" style={{ color: 'var(--text-4)' }}>
              <Clock size={11} /> Estimated Time
            </div>
            <div className="mt-1 text-2xl font-black tracking-tight" style={{ color: 'var(--text)' }}>
              {route ? `${route.duration_min} min` : '— min'}
            </div>
          </div>

          <div className="text-right">
            <div className="text-[10px] font-extrabold uppercase tracking-wider" style={{ color: 'var(--text-4)' }}>
              Distance
            </div>
            <div className="mt-1 text-xl font-bold" style={{ color: 'var(--text-2)' }}>
              {route ? `${route.distance_km.toFixed(1)} km` : '— km'}
            </div>
          </div>
        </div>

        {route && (
          <div className="mt-2.5 flex items-center justify-between border-t pt-2" style={{ borderColor: 'var(--border)' }}>
            <span className="text-[11px] font-medium" style={{ color: 'var(--text-3)' }}>
              Fastest route · {route.segments.length} segments
            </span>
            <button
              onClick={() => setShowSafetyDetails((v) => !v)}
              className="text-[10px] font-bold cursor-pointer hover:underline"
              style={{ color: 'var(--orange)' }}
            >
              {showSafetyDetails ? 'Hide Score' : 'Safety Score'}
            </button>
          </div>
        )}

        {showSafetyDetails && route && (
          <div className="mt-2 rounded-lg p-2 text-xs font-semibold flex items-center justify-between" style={{ background: 'rgba(34,197,94,0.08)', color: '#22c55e' }}>
            <span>Route Safety Rating</span>
            <span className="font-black text-sm">{route.overall_score}/100</span>
          </div>
        )}
      </div>

      {/* Footer */}
      {route && (
        <div className="mt-3 flex items-center justify-between" style={{ borderTop: '1px solid var(--border)', paddingTop: '10px' }}>
          <div className="flex items-center gap-2">
            <RiskBadge level={route.overall_risk} />
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
