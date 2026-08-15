import { AlertTriangle, Flag, Info, X } from 'lucide-react'
import { SEVERITY_META } from '../config'
import { RISK_LOCATION_SOURCE_LABELS, type Segment } from '../types'
import { RiskBadge, SectionLabel } from './ui'

interface Props {
  segment: Segment
  onClose: () => void
  onReportHazard: (segment: Segment) => void
}

export function SegmentPanel({ segment, onClose, onReportHazard }: Props) {
  return (
    <aside className="slide-in-right absolute right-3 top-20 z-[1100] flex max-h-[calc(100%-6rem)] w-[330px] max-w-[calc(100%-1.5rem)] flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-2xl">
      <div className="flex items-start justify-between border-b border-neutral-100 p-4" style={{ backgroundColor: `${segment.risk_color}14` }}>
        <div>
          <SectionLabel>Safety Score</SectionLabel>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-4xl font-extrabold tracking-tight" style={{ color: segment.risk_color }}>
              {segment.safety_score}
            </span>
            <span className="text-sm font-semibold text-neutral-400">/ 100</span>
          </div>
          <div className="mt-1.5">
            <RiskBadge level={segment.risk_level} />
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <button onClick={onClose} className="cursor-pointer rounded-full p-1.5 text-neutral-400 hover:bg-white hover:text-neutral-900">
            <X size={16} />
          </button>
          <span className="text-[11px] font-medium text-neutral-500">{segment.name}</span>
          <span className="text-[10px] text-neutral-400">{segment.distance_km.toFixed(1)} km</span>
        </div>
      </div>

      <div className="slim-scroll flex-1 overflow-y-auto p-4">
        <div className="mb-2 flex items-center gap-1.5">
          <Info size={13} className="text-neutral-400" />
          <SectionLabel>Why this score?</SectionLabel>
        </div>
        <ul className="space-y-2">
          {segment.explanation.map((e) => (
            <li key={e.factor} className="rounded-xl border border-neutral-100 bg-neutral-50 px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-neutral-900">{e.factor}</span>
                <span className="shrink-0 text-xs font-bold text-red-500">+{e.impact} risk</span>
              </div>
              <p className="mt-0.5 text-xs text-neutral-500">{e.detail}</p>
            </li>
          ))}
          {segment.explanation.length === 0 && (
            <li className="rounded-xl bg-green-50 px-3 py-2.5 text-sm text-green-700">
              No significant risk factors on this segment.
            </li>
          )}
        </ul>

        {segment.risk_locations.length > 0 && (
          <>
            <div className="mb-1.5 mt-4 flex items-center gap-1.5">
              <AlertTriangle size={13} className="text-neutral-400" />
              <SectionLabel>Dataset evidence</SectionLabel>
            </div>
            <ul className="space-y-1.5">
              {segment.risk_locations.map((m) => (
                <li key={m.id} className="rounded-lg border border-red-100 bg-red-50/60 px-2.5 py-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-neutral-900">{m.name}</span>
                    <span className="shrink-0 text-[10px] font-bold text-red-500">{Math.round(m.distance_m)} m</span>
                  </div>
                  <p className="mt-0.5 leading-snug text-neutral-600">{m.detail}</p>
                  <div className="mt-1 flex items-center gap-1.5">
                    <span className="rounded bg-neutral-900 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
                      {RISK_LOCATION_SOURCE_LABELS[m.source]}
                    </span>
                    {m.period && (
                      <span className="text-[9px] font-medium text-neutral-400">period {m.period}</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}

        {segment.hazards.length > 0 && (
          <>
            <div className="mb-1.5 mt-4 flex items-center gap-1.5">
              <AlertTriangle size={13} className="text-neutral-400" />
              <SectionLabel>Hazards nearby</SectionLabel>
            </div>
            <ul className="space-y-1.5">
              {segment.hazards.map((h) => (
                <li key={h.id} className="flex items-center justify-between gap-2 rounded-lg bg-neutral-50 px-2.5 py-1.5 text-xs">
                  <span className="flex items-center gap-1.5 text-neutral-700">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: SEVERITY_META[h.severity].color }} />
                    {h.description}
                  </span>
                  <span className="text-[10px] text-neutral-400">
                    {h.distance_m != null ? `${Math.round(h.distance_m)} m` : ''}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}

        <div className="mt-4 rounded-xl bg-neutral-900 px-3 py-2.5">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-orange-400">
            <Flag size={11} /> Recommended action
          </div>
          <p className="mt-1 text-xs leading-relaxed text-neutral-100">{segment.recommendation}</p>
        </div>

        <button
          onClick={() => onReportHazard(segment)}
          className="mt-3 flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-neutral-200 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-100"
        >
          <AlertTriangle size={13} className="text-orange-500" />
          Report a hazard on this segment
        </button>
      </div>
    </aside>
  )
}
