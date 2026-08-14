import { AlertTriangle, Flag, Info, X } from 'lucide-react'
import { SEVERITY_META } from '../config'
import type { Segment } from '../types'
import { RiskBadge, SectionLabel } from './ui'

interface Props {
  segment: Segment
  onClose: () => void
  onReportHazard: (segment: Segment) => void
}

export function SegmentPanel({ segment, onClose, onReportHazard }: Props) {
  return (
    <aside
      className="slide-in-right absolute right-4 top-16 bottom-24 z-[1050] flex w-[320px] max-w-[calc(100%-2rem)] flex-col overflow-hidden rounded-2xl shadow-2xl"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
    >
      <div className="flex items-start justify-between p-4" style={{ backgroundColor: `${segment.risk_color}12`, borderBottom: '1px solid var(--border)' }}>
        <div>
          <SectionLabel>Safety Score</SectionLabel>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-4xl font-extrabold tracking-tight" style={{ color: segment.risk_color }}>
              {segment.safety_score}
            </span>
            <span className="text-sm font-semibold" style={{ color: 'var(--text-4)' }}>/ 100</span>
          </div>
          <div className="mt-1.5">
            <RiskBadge level={segment.risk_level} />
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <button onClick={onClose} className="cursor-pointer rounded-full p-1.5 transition-colors" style={{ color: 'var(--text-3)' }}>
            <X size={16} />
          </button>
          <span className="text-[11px] font-medium" style={{ color: 'var(--text-3)' }}>{segment.name}</span>
          <span className="text-[10px]" style={{ color: 'var(--text-4)' }}>{segment.distance_km.toFixed(1)} km</span>
        </div>
      </div>

      <div className="slim-scroll flex-1 overflow-y-auto p-4" style={{ background: 'var(--surface)' }}>
        <div className="mb-2 flex items-center gap-1.5">
          <Info size={13} className="text-neutral-400" />
          <SectionLabel>Why this score?</SectionLabel>
        </div>
        <ul className="space-y-2">
          {segment.explanation.map((e) => (
            <li
              key={e.factor}
              className="rounded-xl p-3 border transition-all"
              style={{ background: 'var(--bg-2)', borderColor: 'var(--border)' }}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold" style={{ color: 'var(--text)' }}>{e.factor}</span>
                <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black text-rose-500 bg-rose-500/10 border border-rose-500/20">
                  +{e.impact} Risk
                </span>
              </div>
              <p className="mt-1 text-[11px] leading-relaxed" style={{ color: 'var(--text-3)' }}>{e.detail}</p>
            </li>
          ))}
          {segment.explanation.length === 0 && (
            <li className="rounded-xl p-3 text-xs font-semibold border" style={{ background: 'rgba(34,197,94,0.08)', borderColor: 'rgba(34,197,94,0.2)', color: '#22c55e' }}>
              ✓ Optimal Road Conditions — No active risk factors.
            </li>
          )}
        </ul>

        {segment.hazards.length > 0 && (
          <>
            <div className="mb-2 mt-4 flex items-center gap-1.5">
              <AlertTriangle size={13} className="text-orange-500" />
              <SectionLabel>Live Road Hazards</SectionLabel>
            </div>
            <ul className="space-y-2">
              {segment.hazards.map((h) => {
                const meta = SEVERITY_META[h.severity]
                return (
                  <li
                    key={h.id}
                    className="flex items-center justify-between gap-2 rounded-xl p-2.5 border"
                    style={{ background: 'var(--bg-2)', borderColor: 'var(--border)' }}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold text-white shadow-sm"
                        style={{ backgroundColor: meta.color }}
                      >
                        <AlertTriangle size={12} />
                      </span>
                      <div className="min-w-0">
                        <div className="text-xs font-bold truncate" style={{ color: 'var(--text)' }}>{h.description}</div>
                        <div className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: meta.color }}>
                          {meta.label} Severity
                        </div>
                      </div>
                    </div>
                    <span className="shrink-0 text-[10px] font-bold" style={{ color: 'var(--text-4)' }}>
                      {h.distance_m != null ? `${Math.round(h.distance_m)} m` : ''}
                    </span>
                  </li>
                )
              })}
            </ul>
          </>
        )}

        <div className="mt-4 rounded-xl px-3 py-2.5" style={{ background: 'var(--text)' }}>
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--orange)' }}>
            <Flag size={11} /> Recommended action
          </div>
          <p className="mt-1 text-xs leading-relaxed" style={{ color: 'rgba(255,255,255,0.85)' }}>{segment.recommendation}</p>
        </div>

        <button
          onClick={() => onReportHazard(segment)}
          className="mt-3 flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-semibold transition-colors"
          style={{ border: '1px solid var(--border)', color: 'var(--text-2)', background: 'var(--surface)' }}
        >
          <AlertTriangle size={13} className="text-orange-500" />
          Report a hazard on this segment
        </button>
      </div>
    </aside>
  )
}
