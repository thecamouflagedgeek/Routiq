import { Loader2, Navigation } from 'lucide-react'
import { safetyLabel } from '../config'
import type { RouteAlternative } from '../types'

interface Props {
  options: RouteAlternative[]
  selectedId: string | null
  onSelect: (id: string) => void
  onDriveNow: () => void
  loading: boolean
  startName: string
  endName: string
}

function formatDist(km: number): string {
  return km >= 10 ? `${Math.round(km)} km` : `${km.toFixed(1)} km`
}

/** Vertical mini color-bar sampled from a route's segment colors. */
function OptionIndicator({ option, selected }: { option: RouteAlternative; selected: boolean }) {
  const colors = option.segments.slice(0, 3).map((s) => s.risk_color)
  while (colors.length < 3) colors.push(option.overall_color)
  return (
    <div className={`flex h-12 w-7 shrink-0 items-center justify-center ${selected ? '' : 'opacity-70'}`}>
      <div className="flex h-full w-[10px] flex-col gap-[3px] rounded-full p-[2px] shadow-inner" style={{ backgroundColor: '#ecebe7' }}>
        {colors.map((c, i) => (
          <span key={i} className="flex-1 rounded-full" style={{ backgroundColor: c }} />
        ))}
      </div>
    </div>
  )
}

export function RouteSheet({ options, selectedId, onSelect, onDriveNow, loading, startName, endName }: Props) {
  const selected = options.find((o) => o.id === selectedId) ?? options[0] ?? null

  return (
    <div className="fixed inset-x-0 bottom-0 z-[1050] rounded-t-[24px] border-t border-neutral-200 bg-white shadow-[0_-24px_50px_-24px_rgba(0,0,0,0.28)]">
      <div className="mx-auto flex max-w-2xl flex-col px-4 pb-[max(env(safe-area-inset-bottom),1rem)] pt-2 sm:px-5">
        {/* grab handle */}
        <div className="mb-2 flex justify-center">
          <span className="h-1.5 w-12 rounded-full bg-neutral-200" />
        </div>

        {/* summary line */}
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-[11px] font-semibold text-neutral-500">
              {startName} <span className="mx-1 text-neutral-300">→</span> {endName}
            </div>
            <div className="truncate text-base font-black tracking-tight text-neutral-900 sm:text-lg">
              {selected
                ? `${formatDist(selected.distance_km)} • ${Math.round(selected.duration_min)} min • ${safetyLabel(selected.overall_risk)}`
                : loading
                  ? 'Planning a safer route…'
                  : 'Enter a destination to plan a route'}
            </div>
          </div>
          {selected && (
            <span
              className={`shrink-0 rounded-full px-2.5 py-1 text-[9px] font-extrabold tracking-widest ${
                selected.source === 'live' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
              }`}
            >
              {selected.source === 'live' ? '● LIVE' : '○ DEMO'} ROUTE
            </span>
          )}
        </div>

        {/* route options */}
        <div className="mt-3 space-y-1">
          {options.map((opt) => {
            const isSel = opt.id === selectedId
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => onSelect(opt.id)}
                className={`flex w-full cursor-pointer items-center gap-3 rounded-2xl border px-2 py-2 text-left transition-all ${
                  isSel
                    ? 'border-neutral-900 bg-neutral-50 shadow-sm'
                    : 'border-transparent hover:bg-neutral-50'
                }`}
              >
                <OptionIndicator option={opt} selected={isSel} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="text-sm font-bold text-neutral-900">{opt.name}</span>
                    {isSel && (
                      <span className="rounded-full bg-black px-2 py-0.5 text-[8px] font-extrabold uppercase tracking-widest text-white">
                        Selected
                      </span>
                    )}
                  </span>
                  <span className="block text-xs font-semibold text-neutral-500">
                    {formatDist(opt.distance_km)} • {Math.round(opt.duration_min)} min •{' '}
                    <span style={{ color: opt.overall_color }}>{safetyLabel(opt.overall_risk)}</span>
                  </span>
                </span>
              </button>
            )
          })}
        </div>

        {/* CTA */}
        <button
          type="button"
          onClick={onDriveNow}
          disabled={!selected || loading}
          className="mt-4 flex w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-neutral-900 py-3.5 text-sm font-black tracking-wide text-white transition-all hover:bg-neutral-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Navigation size={15} />}
          Drive Now
        </button>
      </div>
    </div>
  )
}
