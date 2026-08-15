import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, ArrowUpDown, ChevronDown, List, MapPin, MapPinned, Navigation, Plus } from 'lucide-react'
import { BookingCard } from '../components/BookingCard'
import { HazardForm } from '../components/HazardForm'
import { MapView } from '../components/map/MapView'
import { PlaceAutocomplete } from '../components/PlaceAutocomplete'
import { SegmentPanel } from '../components/SegmentPanel'
import { SectionLabel } from '../components/ui'
import { DEFAULT_END, DEFAULT_START, SEVERITY_META } from '../config'
import { useGeolocation } from '../hooks/useGeolocation'
import { api } from '../services/api'
import type { Hazard, HazardType, Place, RouteResponse, Segment } from '../types'

type PickMode = 'start' | 'end' | 'hazard' | null

export function Dashboard({
  initialReport = false,
}: {
  initialReport?: boolean
}) {
  const [start, setStart] = useState<Place | null>(DEFAULT_START)
  const [end, setEnd] = useState<Place | null>(DEFAULT_END)
  const [route, setRoute] = useState<RouteResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<Segment | null>(null)
  const [hazards, setHazards] = useState<Hazard[]>([])
  const [showList, setShowList] = useState(false)
  const [pickMode, setPickMode] = useState<PickMode>(null)
  const [reportOpen, setReportOpen] = useState(false)
  const [reportLocation, setReportLocation] = useState<{ lat: number; lon: number } | null>(null)
  const [reportPreset, setReportPreset] = useState<{ type?: HazardType } | undefined>(undefined)
  const [fullscreen, setFullscreen] = useState(false)
  const [searchExpanded, setSearchExpanded] = useState(true)
  const mapRef = useRef<L.Map | null>(null)
  const geo = useGeolocation()

  const loadRoute = useCallback(async (s: Place, e: Place) => {
    setLoading(true)
    setSelected(null)
    setShowList(false)
    try {
      const r = await api.getRoute([s.lat, s.lon], [e.lat, e.lon])
      setRoute(r)
      const mid = r.geometry[Math.floor(r.geometry.length / 2)]
      const hz = await api.getHazards(mid[0], mid[1], 9000, 60)
      setHazards(hz)
    } catch (err) {
      console.error('route failed', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadRoute(DEFAULT_START, DEFAULT_END)
  }, [loadRoute])

  // opened from the navbar's Report Hazard button
  useEffect(() => {
    if (initialReport) {
      openHazardForm()
      window.history.replaceState(null, '', '#/dashboard')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialReport])

  const onPickMapLocation = useCallback(
    (lat: number, lon: number) => {
      if (pickMode === 'start' || pickMode === 'end') {
        const place: Place = {
          label: `Pinned location (${lat.toFixed(4)}, ${lon.toFixed(4)})`,
          sublabel: 'Map pin',
          lat,
          lon,
          city: '',
        }
        if (pickMode === 'start') {
          setStart(place)
          if (end) loadRoute(place, end)
        } else {
          setEnd(place)
          if (start) loadRoute(start, place)
        }
        setPickMode(null)
      } else if (pickMode === 'hazard') {
        setReportLocation({ lat, lon })
        setPickMode(null)
        setReportOpen(true)
      }
    },
    [pickMode, end, start, loadRoute],
  )

  const useMyLocationForPlace = useCallback(
    async (which: 'start' | 'end') => {
      const fix = await geo.getPosition()
      if (!fix) return
      const place: Place = { label: 'My location', sublabel: 'Current position', lat: fix.lat, lon: fix.lon, city: '' }
      if (which === 'start') {
        setStart(place)
        if (end) loadRoute(place, end)
      } else {
        setEnd(place)
        if (start) loadRoute(start, place)
      }
    },
    [geo, end, start, loadRoute],
  )

  const openHazardForm = useCallback((opts?: { lat?: number; lon?: number; type?: HazardType; segment?: Segment }) => {
    setReportPreset(opts?.type ? { type: opts.type } : undefined)
    if (opts?.lat != null && opts?.lon != null) {
      setReportLocation({ lat: opts.lat, lon: opts.lon })
    } else {
      setReportLocation(null)
    }
    setReportOpen(true)
  }, [])

  const onSubmitted = useCallback((h: Hazard) => {
    setHazards((prev) => [h, ...prev.filter((x) => x.id !== h.id)])
  }, [])

  const worst = useMemo(() => {
    if (!route?.segments.length) return null
    return [...route.segments].sort((a, b) => a.safety_score - b.safety_score)[0]
  }, [route])

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {})
      setFullscreen(false)
    } else {
      document.documentElement.requestFullscreen().catch(() => {})
      setFullscreen(true)
    }
  }, [])

  const segments = route?.segments ?? []

  const swapRoutePoints = useCallback(() => {
    const nextStart = end
    const nextEnd = start
    if (!nextStart || !nextEnd) return
    setStart(nextStart)
    setEnd(nextEnd)
    loadRoute(nextStart, nextEnd)
  }, [start, end, loadRoute])

  return (
    <div className="relative h-screen w-full overflow-hidden bg-neutral-100">
      {/* Map backdrop canvas */}
      <div className="absolute inset-0 z-0">
        <MapView
          route={route}
          hazards={hazards}
          selectedSegment={selected}
          onSelectSegment={(s) => {
            setSelected(s)
            setShowList(false)
          }}
          hazardPickMode={pickMode === 'hazard'}
          onPickLocation={onPickMapLocation}
          onReady={(m) => {
            mapRef.current = m
          }}
          onFullscreen={toggleFullscreen}
          isFullscreen={fullscreen}
          startLabel={start?.name ?? start?.label ?? 'Start'}
          endLabel={end?.name ?? end?.label ?? 'Destination'}
        />
      </div>

      {/* Route-preview search and planning overlay */}
      <div className="pointer-events-none absolute inset-x-2 top-3 z-[1050] sm:inset-x-3 md:top-6 md:px-6">
        <div className="pointer-events-auto mx-auto max-w-[560px] rounded-[24px] border border-neutral-200/80 bg-white/90 p-2 shadow-[0_12px_30px_rgba(15,23,42,0.12)] backdrop-blur-xl sm:p-2.5 md:max-w-xl">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={() => setSearchExpanded((v) => !v)}
              className="flex min-w-0 flex-1 items-center gap-1.5 rounded-2xl px-1.5 py-1.5 text-left hover:bg-neutral-50 sm:gap-2 sm:px-2"
            >
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-orange-100 text-orange-600 sm:h-8 sm:w-8">
                <MapPin size={12} className="sm:size-[14px]" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[9px] font-medium uppercase tracking-[0.14em] text-neutral-400 sm:text-[10px]">From</div>
                <div className="truncate text-xs font-bold text-neutral-900 sm:text-sm">{start?.name ?? start?.label ?? 'Origin'}</div>
              </div>
            </button>

            <button
              type="button"
              onClick={swapRoutePoints}
              title="Swap origin and destination"
              className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-800 shadow-sm transition hover:bg-neutral-50 sm:h-9 sm:w-9"
            >
              <ArrowUpDown size={14} className="sm:size-[15px]" />
            </button>

            <button
              type="button"
              onClick={() => setSearchExpanded((v) => !v)}
              className="flex min-w-0 flex-1 items-center gap-1.5 rounded-2xl px-1.5 py-1.5 text-left hover:bg-neutral-50 sm:gap-2 sm:px-2"
            >
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-white sm:h-8 sm:w-8">
                <Navigation size={12} className="sm:size-[14px]" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[9px] font-medium uppercase tracking-[0.14em] text-neutral-400 sm:text-[10px]">To</div>
                <div className="truncate text-xs font-bold text-neutral-900 sm:text-sm">{end?.name ?? end?.label ?? 'Destination'}</div>
              </div>
            </button>

            <button
              type="button"
              title="Calculate route"
              onClick={() => start && end && loadRoute(start, end)}
              className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full bg-black text-white shadow-md transition-all hover:bg-neutral-800 active:scale-95 sm:h-11 sm:w-11"
            >
              <ArrowRight size={16} className="sm:size-[18px]" />
            </button>
          </div>

          {searchExpanded && (
            <div className="mt-2 space-y-2 border-t border-neutral-100 pt-2">
              <div className="flex items-center justify-between rounded-xl bg-neutral-50 px-2 py-1.5">
                <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-neutral-400">Route search</span>
                <button
                  type="button"
                  onClick={() => setSearchExpanded(false)}
                  className="inline-flex items-center gap-1 text-[10px] font-bold text-neutral-600"
                >
                  <ChevronDown size={12} className="rotate-180" /> Close
                </button>
              </div>

              <div className="rounded-2xl border border-neutral-200 bg-white p-2 shadow-sm">
                <div className="mb-2 flex items-center gap-2 rounded-xl bg-neutral-50 px-2 py-1.5">
                  <MapPin size={12} className="text-orange-500" />
                  <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-neutral-500">Start</span>
                </div>
                <PlaceAutocomplete
                  value={start}
                  placeholder="Enter starting destination"
                  variant="start"
                  onSelect={(p) => {
                    setStart(p)
                    if (end) loadRoute(p, end)
                    setSearchExpanded(false)
                  }}
                  onUseMyLocation={() => useMyLocationForPlace('start')}
                  onPickOnMap={() => setPickMode('start')}
                  picking={pickMode === 'start'}
                />
              </div>

              <div className="rounded-2xl border border-neutral-200 bg-white p-2 shadow-sm">
                <div className="mb-2 flex items-center gap-2 rounded-xl bg-neutral-50 px-2 py-1.5">
                  <Navigation size={12} className="text-neutral-900" />
                  <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-neutral-500">Destination</span>
                </div>
                <PlaceAutocomplete
                  value={end}
                  placeholder="Enter ending destination"
                  variant="end"
                  onSelect={(p) => {
                    setEnd(p)
                    if (start) loadRoute(start, p)
                    setSearchExpanded(false)
                  }}
                  onUseMyLocation={() => useMyLocationForPlace('end')}
                  onPickOnMap={() => setPickMode('end')}
                  picking={pickMode === 'end'}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Nearby hazards widget */}
      {hazards.length > 0 && (
        <div className="hidden md:block w-[380px] max-w-full rounded-2xl border border-neutral-200/80 bg-white/95 p-4 shadow-lg backdrop-blur-md md:absolute md:left-6 md:top-32">
          <div className="mb-2 flex items-center justify-between">
            <SectionLabel>Live road hazards</SectionLabel>
            <button
              onClick={() => openHazardForm()}
              className="flex cursor-pointer items-center gap-1 rounded-full bg-neutral-100 px-2.5 py-1 text-[11px] font-bold text-neutral-700 hover:bg-neutral-200"
            >
              <Plus size={12} /> Report
            </button>
          </div>
          <ul className="space-y-1.5">
            {hazards.slice(0, 3).map((h) => (
              <li key={h.id} className="flex items-center justify-between gap-2 text-xs">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: SEVERITY_META[h.severity].color }} />
                  <span className="truncate font-semibold text-neutral-800">{h.description}</span>
                  {h.source === 'user' && (
                    <span className="rounded bg-black px-1.5 py-0.5 text-[9px] font-extrabold text-white">YOU</span>
                  )}
                </span>
                <span className="shrink-0 text-[10px] font-medium text-neutral-400">
                  {h.distance_m != null ? `${Math.round(h.distance_m)} m` : ''}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="md:hidden">
        <BookingCard
          route={route}
          loading={loading}
          onPlanRoute={() => start && end && loadRoute(start, end)}
          onShowSegments={() => {
            setShowList((v) => !v)
            setSelected(null)
          }}
          expanded={showList}
        />
      </div>

      {/* Route segment list drawer */}
      {showList && route && (
        <aside className="slide-in-right absolute right-3 top-20 z-[1100] flex max-h-[calc(100%-6rem)] w-[320px] max-w-[calc(100%-1.5rem)] flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white/95 shadow-2xl backdrop-blur-md">
          <div className="flex items-center justify-between border-b border-neutral-100 p-4">
            <div className="flex items-center gap-2">
              <List size={16} className="text-neutral-500" />
              <SectionLabel>Route breakdown</SectionLabel>
            </div>
            <button onClick={() => setShowList(false)} className="cursor-pointer text-neutral-400 hover:text-neutral-900">
              <ArrowRight size={16} className="rotate-180" />
            </button>
          </div>
          <div className="slim-scroll flex-1 overflow-y-auto p-2">
            {segments.map((seg, i) => (
              <button
                key={seg.id}
                onClick={() => {
                  setSelected(seg)
                  setShowList(false)
                }}
                className="flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-neutral-100"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-black text-white" style={{ backgroundColor: seg.risk_color }}>
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-neutral-900">{seg.name}</span>
                  <span className="block text-[11px] font-semibold text-neutral-400">{seg.distance_km.toFixed(1)} km</span>
                </span>
                <span className="text-sm font-black" style={{ color: seg.risk_color }}>
                  {seg.safety_score}
                </span>
              </button>
            ))}
          </div>
          {worst && (
            <div className="border-t border-neutral-100 p-3">
              <div className="rounded-xl bg-red-50 p-3">
                <div className="text-[10px] font-extrabold uppercase tracking-widest text-red-500">Most dangerous segment</div>
                <div className="mt-0.5 flex items-center justify-between">
                  <span className="text-xs font-bold text-neutral-800">{worst.name}</span>
                  <span className="text-lg font-black text-red-500">{worst.safety_score}</span>
                </div>
                <button
                  onClick={() => {
                    setSelected(worst)
                    setShowList(false)
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

      {/* Segment explanation panel */}
      {selected && (
        <SegmentPanel
          segment={selected}
          onClose={() => setSelected(null)}
          onReportHazard={(seg) => {
            const mid = seg.geometry[Math.floor(seg.geometry.length / 2)]
            openHazardForm({ lat: mid[0], lon: mid[1] })
          }}
        />
      )}

      {/* Hazard report modal */}
      <HazardForm
        key={`${reportOpen}-${reportPreset?.type ?? 'none'}`}
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        defaultLocation={reportLocation}
        preset={reportPreset}
        picking={pickMode === 'hazard'}
        onPickFromMap={() => {
          setReportOpen(false)
          setPickMode('hazard')
        }}
        onUseMyLocation={async () => {
          const fix = await geo.getPosition()
          if (fix) setReportLocation({ lat: fix.lat, lon: fix.lon })
        }}
        onSubmitted={onSubmitted}
      />

      {pickMode === 'hazard' && (
        <div className="absolute bottom-6 left-1/2 z-[1060] -translate-x-1/2">
          <div className="flex items-center gap-2 rounded-full bg-neutral-900 px-5 py-3 text-xs font-bold text-white shadow-2xl">
            <MapPin size={14} className="text-orange-400" />
            Click on the map to place hazard
            <button
              onClick={() => setPickMode(null)}
              className="ml-2 cursor-pointer rounded-full bg-white/20 px-2.5 py-0.5 text-[10px] hover:bg-white/30"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

