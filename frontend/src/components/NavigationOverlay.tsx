import { CornerUpLeft, CornerUpRight, Flag, Navigation, Siren, X } from 'lucide-react'

export interface NavData {
  /** Current maneuver instruction, e.g. "Turn left onto Main St". */
  instruction: string
  /** Distance remaining to the next maneuver, meters. */
  distanceM: number
  /** Estimated seconds to the next maneuver. */
  etaSec: number
  /** 0..1 overall trip progress (drives the gauge needle). */
  progress: number
  /** True once the destination is reached. */
  arrived: boolean
}

interface Props {
  nav: NavData
  destinationName: string
  onExit: () => void
  onEndTrip: () => void
  onSOS: () => void
  /** px from the top of the viewport where the banner starts (navbar height). */
  topOffset?: number
}

function parseInstruction(raw: string): { action: string; street: string | null } {
  const m = raw.match(/^(.+?)\s+onto\s+(.+)$/i)
  if (!m) return { action: raw, street: null }
  let action = m[1].replace(/^turn\s+/i, '').trim()
  if (action) action = action.charAt(0).toUpperCase() + action.slice(1)
  return { action, street: m[2] }
}

function formatDist(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.max(0, Math.round(m))} m`
}

function formatEta(sec: number): string {
  const s = Math.max(0, Math.round(sec))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${String(r).padStart(2, '0')} min`
}

export function NavigationOverlay({
  nav,
  destinationName,
  onExit,
  onEndTrip,
  onSOS,
  topOffset = 0,
}: Props) {
  const { action, street } = parseInstruction(nav.instruction)
  const isLeft = /left/i.test(action)
  const isRight = /right/i.test(action)

  return (
    <div className="pointer-events-none absolute inset-0 z-[1100]">
      {/* top instruction banner */}
      <div
        className="pointer-events-auto absolute inset-x-0 flex items-center gap-4 bg-neutral-900 px-5 py-4 text-white shadow-2xl"
        style={{ top: topOffset }}
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/10">
          {nav.arrived ? (
            <Flag size={22} className="text-green-400" />
          ) : isLeft ? (
            <CornerUpLeft size={22} />
          ) : isRight ? (
            <CornerUpRight size={22} />
          ) : (
            <Navigation size={22} />
          )}
        </span>
        <div className="min-w-0 flex-1">
          {nav.arrived ? (
            <>
              <div className="truncate text-lg font-black tracking-tight">You have arrived</div>
              <div className="truncate text-xs font-medium text-neutral-300">{destinationName}</div>
            </>
          ) : (
            <>
              <div className="truncate text-lg font-black tracking-tight">
                {action}
                {street && (
                  <>
                    {' '}
                    onto <span className="font-extrabold">{street}</span>
                  </>
                )}
              </div>
              <div className="text-xs font-medium text-neutral-300">in {formatDist(nav.distanceM)}</div>
            </>
          )}
        </div>
        <button
          type="button"
          onClick={onExit}
          className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full bg-white/10 text-neutral-300 hover:bg-white/20"
          title="Close navigation"
        >
          <X size={17} />
        </button>
      </div>

      {/* next-turn widget (distance + ETA) */}
      <div
        className="pointer-events-auto absolute right-3 flex flex-col items-center rounded-2xl border border-neutral-200 bg-white/95 px-4 py-3 shadow-[0_8px_30px_rgba(0,0,0,0.14)] backdrop-blur-sm"
        style={{ top: topOffset + 96 }}
      >
        <div className="text-center">
          <div className="text-lg font-black tabular-nums text-neutral-900">{formatDist(nav.distanceM)}</div>
          <div className="text-xs font-semibold tabular-nums text-neutral-500">
            {nav.arrived ? '0:00 min' : formatEta(nav.etaSec)}
          </div>
        </div>
      </div>

      {/* bottom controls */}
      <div className="pointer-events-auto absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 bg-gradient-to-t from-black/25 to-transparent px-4 pb-[max(env(safe-area-inset-bottom),1rem)] pt-8">
        <button
          type="button"
          onClick={onExit}
          title="Exit navigation"
          className="flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center rounded-2xl bg-white text-neutral-900 shadow-lg hover:bg-neutral-100"
        >
          <X size={20} />
        </button>
        <button
          type="button"
          onClick={onEndTrip}
          className="h-12 flex-1 cursor-pointer rounded-full bg-white/95 px-6 text-sm font-bold text-neutral-900 shadow-lg hover:bg-white"
        >
          End Trip
        </button>
        <button
          type="button"
          onClick={onSOS}
          title="Emergency SOS"
          className="flex h-12 shrink-0 cursor-pointer items-center gap-1.5 rounded-2xl bg-red-600 px-4 text-sm font-black text-white shadow-lg hover:bg-red-500"
        >
          <Siren size={16} /> SOS
        </button>
      </div>
    </div>
  )
}
