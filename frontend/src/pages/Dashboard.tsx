import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowRight,
  List,
  MapPin,
  MapPinned,
  Pause,
  Play,
  Plus,
  RotateCcw,
  ShieldCheck,
  Square,
} from 'lucide-react'
import L from 'leaflet'
import { BookingCard } from '../components/BookingCard'
import { DriveHUD } from '../components/DriveHUD'
import { HazardForm } from '../components/HazardForm'
import { MapView } from '../components/map/MapView'
import { PlaceAutocomplete } from '../components/PlaceAutocomplete'
import { SavedPlaces } from '../components/SavedPlaces'
import { SegmentPanel } from '../components/SegmentPanel'
import { SectionLabel } from '../components/ui'
import { DEFAULT_END, DEFAULT_START, RISK_META, SEVERITY_META } from '../config'
import { useFatigue } from '../hooks/useFatigue'
import { useGeolocation } from '../hooks/useGeolocation'
import { useSimulation } from '../hooks/useSimulation'
import { api } from '../services/api'
import type { Hazard, HazardType, Place, RouteResponse, Segment } from '../types'

type PickMode = 'start' | 'end' | 'hazard' | null

export function Dashboard({
  onOpenEmergency,
  initialReport = false,
  dark,
}: {
  onOpenEmergency: () => void
  initialReport?: boolean
  dark?: boolean
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
  const mapRef = useRef<L.Map | null>(null)
  const geo = useGeolocation()

  // ── simulation ──────────────────────────────────────────────────────────
  const { sim, start: simStart, pause: simPause, resume: simResume, reset: simReset } = useSimulation(route)
  const isSimulating = sim.phase === 'running' || sim.phase === 'paused'

  // ── fatigue (Sleep Drive running in background during sim) ───────────────
  const fatigue = useFatigue()

  // auto-start/stop fatigue with simulation
  useEffect(() => {
    if (sim.phase === 'running' && fatigue.phase === 'idle') {
      fatigue.start()
    }
    if (sim.phase === 'idle' && fatigue.phase !== 'idle') {
      fatigue.stop()
    }
  }, [sim.phase]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── route loading ────────────────────────────────────────────────────────
  const loadRoute = useCallback(async (s: Place, e: Place) => {
    setLoading(true)
    setSelected(null)
    setShowList(false)
    simReset()
    try {
      const r = await api.getRoute([s.lat, s.lon], [e.lat, e.lon])
      setRoute(r)
      const mid = r.geometry[Math.floor(r.geometry.length / 2)]
      const hz = await api.getHazards(mid[0], mid[1], 3000, 8)
      setHazards(hz)
    } catch (err) {
      console.error('route failed', err)
    } finally {
      setLoading(false)
    }
  }, [simReset])

  useEffect(() => {
    loadRoute(DEFAULT_START, DEFAULT_END)
  }, [loadRoute])

  useEffect(() => {
    if (initialReport) {
      openHazardForm()
      window.history.replaceState(null, '', '#/dashboard')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialReport])

  const onPickMapLocation = useCallback(
    async (lat: number, lon: number) => {
      if (pickMode === 'start' || pickMode === 'end') {
        let label = `Pinned (${lat.toFixed(4)}, ${lon.toFixed(4)})`
        let sublabel = 'Map location'
        try {
          const rev = await api.reverseGeocode(lat, lon)
          if (rev?.formattedAddress) {
            label = rev.name || rev.formattedAddress
            sublabel = rev.formattedAddress
          }
        } catch (e) {
          console.error('Reverse geocode error:', e)
        }
        const place: Place = { label, sublabel, lat, lon, city: 'Mumbai', formattedAddress: sublabel }
        if (pickMode === 'start') { setStart(place); if (end) loadRoute(place, end) }
        else { setEnd(place); if (start) loadRoute(start, place) }
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
      let label = 'My location'
      let sublabel = 'Current GPS position'
      try {
        const rev = await api.reverseGeocode(fix.lat, fix.lon)
        if (rev?.formattedAddress) {
          label = rev.name || 'My location'
          sublabel = rev.formattedAddress
        }
      } catch (e) {
        console.error('Reverse geocode error:', e)
      }
      const place: Place = { label, sublabel, lat: fix.lat, lon: fix.lon, city: 'Mumbai', formattedAddress: sublabel }
      if (which === 'start') { setStart(place); if (end) loadRoute(place, end) }
      else { setEnd(place); if (start) loadRoute(start, place) }
    },
    [geo, end, start, loadRoute],
  )

  const openHazardForm = useCallback((opts?: { lat?: number; lon?: number; type?: HazardType; segment?: Segment }) => {
    setReportPreset(opts?.type ? { type: opts.type } : undefined)
    if (opts?.lat != null && opts?.lon != null) setReportLocation({ lat: opts.lat, lon: opts.lon })
    else setReportLocation(null)
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

  // ── start demo ──────────────────────────────────────────────────────────
  const handleStartDemo = useCallback(() => {
    if (!route) return
    setSelected(null)
    setShowList(false)
    simStart()
  }, [route, simStart])

  return (
    <div className="relative h-screen w-full overflow-hidden" style={{ background: 'var(--bg-2)' }}>

      {/* ── Map ── */}
      <div className="absolute inset-0 z-0">
        <MapView
          route={route}
          hazards={hazards}
          selectedSegment={selected}
          vehiclePosition={sim.position}
          currentSegmentId={sim.currentSegment?.id ?? null}
          onSelectSegment={(s) => { if (!isSimulating) { setSelected(s); setShowList(false) } }}
          hazardPickMode={pickMode === 'hazard'}
          onPickLocation={onPickMapLocation}
          onReady={(m) => { mapRef.current = m }}
          onFullscreen={toggleFullscreen}
          isFullscreen={fullscreen}
          startLabel={start?.name ?? start?.label ?? 'Start'}
          endLabel={end?.name ?? end?.label ?? 'Destination'}
          dark={dark}
        />
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          LEFT PANEL — Desktop pre-drive planning / demo controls
      ═══════════════════════════════════════════════════════════════════ */}
      {!isSimulating && sim.phase !== 'finished' && (
        <div
          className="pointer-events-auto hidden md:block absolute inset-y-0 left-0 z-[1050] w-[380px] overflow-y-auto overflow-x-hidden scrollbar-hide p-4 pt-4"
          style={{
            background: 'var(--surface)',
            borderRight: '1px solid var(--border)',
            boxShadow: 'var(--shadow-xl)',
          }}
        >
          <div className="pointer-events-auto space-y-3">

            {/* 1. Hero Card */}
            <div
              className="rounded-2xl p-4 shadow-sm"
              style={{ background: 'var(--bg-2)', border: '1px solid var(--border)' }}
            >
              <h1 className="text-2xl font-black leading-[1.1] tracking-tight" style={{ color: 'var(--text)' }}>
                Know the road.<br />
                <span style={{ color: 'var(--orange)' }}>Before you drive it.</span>
              </h1>
              <p className="mt-1.5 text-xs font-medium leading-relaxed" style={{ color: 'var(--text-3)' }}>
                Segment-level safety scores. Real-time driver monitoring. Contextual risk fusion.
              </p>
            </div>

            {/* 2. START DEMO DRIVE Button */}
            {route && (
              <button
                onClick={handleStartDemo}
                disabled={loading}
                className="flex w-full cursor-pointer items-center justify-center gap-2.5 rounded-2xl py-3.5 text-sm font-black text-white shadow-xl transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)' }}
              >
                <Play size={16} fill="white" />
                START DEMO DRIVE
              </button>
            )}

            {/* 3. Booking / Route Stats Card */}
            <BookingCard
              route={route}
              loading={loading}
              onPlanRoute={() => start && end && loadRoute(start, end)}
              onShowSegments={() => { setShowList((v) => !v); setSelected(null) }}
              expanded={showList}
            />

            {/* 4. Location Pickers */}
            <div
              className="rounded-2xl p-3 shadow-sm"
              style={{ background: 'var(--bg-2)', border: '1px solid var(--border)' }}
            >
              <div className="space-y-2">
                <PlaceAutocomplete
                  value={start}
                  placeholder="Start — e.g. Bandra West"
                  variant="start"
                  onSelect={(p) => { setStart(p); if (end) loadRoute(p, end) }}
                  onUseMyLocation={() => useMyLocationForPlace('start')}
                  onPickOnMap={() => setPickMode('start')}
                  picking={pickMode === 'start'}
                />
                <PlaceAutocomplete
                  value={end}
                  placeholder="Destination — e.g. Malad West"
                  variant="end"
                  onSelect={(p) => { setEnd(p); if (start) loadRoute(start, p) }}
                  onUseMyLocation={() => useMyLocationForPlace('end')}
                  onPickOnMap={() => setPickMode('end')}
                  picking={pickMode === 'end'}
                />
              </div>
            </div>

            {/* 5. Saved Places (Home & Work) Widget */}
            <SavedPlaces
              onSelectPlace={(place) => {
                setEnd(place)
                if (start) loadRoute(start, place)
              }}
            />
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          MOBILE PRE-DRIVE FLOATING CARD SHEET (Uber App Style)
      ═══════════════════════════════════════════════════════════════════ */}
      {!isSimulating && sim.phase !== 'finished' && (
        <div className="fixed inset-x-3 bottom-[74px] z-[1050] md:hidden max-h-[60vh] overflow-y-auto space-y-2.5 p-1 rounded-3xl backdrop-blur-lg">
          
          {/* Location Pickers Card */}
          <div
            className="rounded-2xl p-3 shadow-md border"
            style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
          >
            <div className="space-y-2">
              <PlaceAutocomplete
                value={start}
                placeholder="Start — e.g. Bandra West"
                variant="start"
                onSelect={(p) => { setStart(p); if (end) loadRoute(p, end) }}
                onUseMyLocation={() => useMyLocationForPlace('start')}
                onPickOnMap={() => setPickMode('start')}
                picking={pickMode === 'start'}
              />
              <PlaceAutocomplete
                value={end}
                placeholder="Destination — e.g. Malad West"
                variant="end"
                onSelect={(p) => { setEnd(p); if (start) loadRoute(start, p) }}
                onUseMyLocation={() => useMyLocationForPlace('end')}
                onPickOnMap={() => setPickMode('end')}
                picking={pickMode === 'end'}
              />
            </div>
          </div>

          {/* Saved Places (Home & Work) Card */}
          <SavedPlaces
            onSelectPlace={(place) => {
              setEnd(place)
              if (start) loadRoute(start, place)
            }}
          />

          {/* Route Booking Stats Card */}
          <BookingCard
            route={route}
            loading={loading}
            onPlanRoute={() => start && end && loadRoute(start, end)}
            onShowSegments={() => { setShowList((v) => !v); setSelected(null) }}
            expanded={showList}
          />

          {/* START DEMO DRIVE Button */}
          {route && (
            <button
              onClick={handleStartDemo}
              disabled={loading}
              className="flex w-full cursor-pointer items-center justify-center gap-2.5 rounded-2xl py-3.5 text-xs font-black text-white shadow-xl transition-all active:scale-95"
              style={{ background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)' }}
            >
              <Play size={14} fill="white" /> START DEMO DRIVE
            </button>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          RIGHT PANEL — DriveHUD during simulation
      ═══════════════════════════════════════════════════════════════════ */}
      {isSimulating && (
        <div className="pointer-events-none absolute right-0 top-16 z-[1050] flex max-h-[calc(100vh-4.5rem)] w-[300px] flex-col overflow-y-auto overflow-x-hidden scrollbar-hide p-3">
          <DriveHUD
            currentSegment={sim.currentSegment}
            nextSegment={sim.nextSegment}
            progress={sim.progress}
            demoPhase={sim.demoPhase}
            fatigueState={fatigue.state}
            fatiguePhase={fatigue.phase}
            onOpenEmergency={onOpenEmergency}
          />
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          Simulation controls bar (top centre, during sim)
      ═══════════════════════════════════════════════════════════════════ */}
      {isSimulating && (
        <div className="absolute top-20 left-1/2 z-[1060] -translate-x-1/2">
          <div
            className="flex items-center gap-2 rounded-2xl px-4 py-2.5 shadow-xl"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
          >
            <span className="flex items-center gap-1.5 text-xs font-bold" style={{ color: 'var(--orange)' }}>
              <span className="h-2 w-2 rounded-full pulse-dot" style={{ background: 'var(--orange)' }} />
              LIVE DEMO
            </span>
            <div className="h-4 w-px" style={{ background: 'var(--border)' }} />
            <span className="text-xs font-semibold" style={{ color: 'var(--text-3)' }}>
              {Math.round(sim.progress * 100)}% complete
            </span>
            <div className="h-4 w-px" style={{ background: 'var(--border)' }} />
            {sim.phase === 'running'
              ? (
                <button
                  onClick={simPause}
                  className="flex cursor-pointer items-center gap-1 rounded-full px-3 py-1 text-xs font-bold transition-colors"
                  style={{ background: 'var(--bg-2)', color: 'var(--text)' }}
                >
                  <Pause size={12} /> Pause
                </button>
              )
              : (
                <button
                  onClick={simResume}
                  className="flex cursor-pointer items-center gap-1 rounded-full px-3 py-1 text-xs font-bold transition-colors"
                  style={{ background: 'var(--orange)', color: '#fff' }}
                >
                  <Play size={12} /> Resume
                </button>
              )
            }
            <button
              onClick={() => { simReset(); fatigue.stop() }}
              className="flex cursor-pointer items-center gap-1 rounded-full px-3 py-1 text-xs font-bold transition-colors"
              style={{ background: 'var(--bg-3)', color: 'var(--text-2)' }}
            >
              <RotateCcw size={12} /> Stop
            </button>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          Finished state
      ═══════════════════════════════════════════════════════════════════ */}
      {sim.phase === 'finished' && (
        <div className="absolute inset-0 z-[1200] flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div
            className="rounded-3xl p-8 text-center shadow-2xl w-80"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
          >
            <div className="mb-3 text-4xl">🏁</div>
            <h2 className="text-xl font-black" style={{ color: 'var(--text)' }}>Drive Complete</h2>
            <p className="mt-1 text-sm" style={{ color: 'var(--text-3)' }}>
              Route of {route?.distance_km.toFixed(1)} km · Safety: {route?.overall_score}/100
            </p>
            <div className="mt-5 flex gap-2">
              <button
                onClick={() => { simReset(); fatigue.stop() }}
                className="flex-1 rounded-2xl py-3 text-sm font-bold text-white cursor-pointer"
                style={{ background: 'var(--orange)' }}
              >
                <RotateCcw size={14} className="inline mr-1" />
                Reset
              </button>
              <button
                onClick={onOpenEmergency}
                className="flex-1 rounded-2xl py-3 text-sm font-bold text-white cursor-pointer"
                style={{ background: '#dc2626' }}
              >
                🚨 Emergency
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          Route segment list drawer (pre-drive)
      ═══════════════════════════════════════════════════════════════════ */}
      {showList && route && !isSimulating && (
        <aside
          className="slide-in-right absolute right-4 top-16 bottom-24 z-[1050] flex w-[320px] max-w-[calc(100%-2rem)] flex-col overflow-hidden rounded-2xl shadow-2xl"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          <div className="flex items-center justify-between p-4" style={{ borderBottom: '1px solid var(--border)' }}>
            <div className="flex items-center gap-2">
              <List size={16} style={{ color: 'var(--text-3)' }} />
              <SectionLabel>Route breakdown</SectionLabel>
            </div>
            <button onClick={() => setShowList(false)} className="cursor-pointer" style={{ color: 'var(--text-4)' }}>
              <ArrowRight size={16} className="rotate-180" />
            </button>
          </div>
          <div className="slim-scroll flex-1 overflow-y-auto p-2">
            {segments.map((seg, i) => (
              <button
                key={seg.id}
                onClick={() => { setSelected(seg); setShowList(false) }}
                className="flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors"
                style={{ ':hover': { background: 'var(--bg-2)' } } as React.CSSProperties}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-2)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = '')}
              >
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-black text-white"
                  style={{ backgroundColor: seg.risk_color }}
                >
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold" style={{ color: 'var(--text)' }}>{seg.name}</span>
                  <span className="block text-[11px] font-semibold" style={{ color: 'var(--text-4)' }}>{seg.distance_km.toFixed(1)} km</span>
                </span>
                <span className="text-sm font-black" style={{ color: seg.risk_color }}>
                  {seg.safety_score}
                </span>
              </button>
            ))}
          </div>
          {worst && (
            <div className="p-3" style={{ borderTop: '1px solid var(--border)' }}>
              <div className="rounded-xl p-3" style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)' }}>
                <div className="text-[10px] font-extrabold uppercase tracking-widest text-red-500">Most dangerous segment</div>
                <div className="mt-0.5 flex items-center justify-between">
                  <span className="text-xs font-bold" style={{ color: 'var(--text)' }}>{worst.name}</span>
                  <span className="text-lg font-black text-red-500">{worst.safety_score}</span>
                </div>
                <button
                  onClick={() => { setSelected(worst); setShowList(false) }}
                  className="mt-2 flex w-full cursor-pointer items-center justify-center gap-1 rounded-lg bg-red-500 py-1.5 text-xs font-bold text-white hover:bg-red-600"
                >
                  <MapPinned size={13} /> Inspect Segment Risk
                </button>
              </div>
            </div>
          )}
        </aside>
      )}

      {/* Segment panel (pre-drive only) */}
      {selected && !isSimulating && (
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
        onPickFromMap={() => { setReportOpen(false); setPickMode('hazard') }}
        onUseMyLocation={async () => { const fix = await geo.getPosition(); if (fix) setReportLocation({ lat: fix.lat, lon: fix.lon }) }}
        onSubmitted={onSubmitted}
      />

      {pickMode === 'hazard' && (
        <div className="absolute bottom-6 left-1/2 z-[1060] -translate-x-1/2">
          <div
            className="flex items-center gap-2 rounded-full px-5 py-3 text-xs font-bold text-white shadow-2xl"
            style={{ background: 'var(--text)' }}
          >
            <MapPin size={14} style={{ color: 'var(--orange)' }} />
            Click on the map to place hazard
            <button
              onClick={() => setPickMode(null)}
              className="ml-2 cursor-pointer rounded-full px-2.5 py-0.5 text-[10px]"
              style={{ background: 'rgba(255,255,255,0.15)' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
