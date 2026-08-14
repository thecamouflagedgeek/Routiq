import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Car,
  CheckCircle2,
  ClipboardCopy,
  ExternalLink,
  Loader2,
  MapPin,
  Navigation,
  PhoneCall,
  Share2,
  Siren,
} from 'lucide-react'
import { MapView } from '../components/map/MapView'
import { PillButton, SectionLabel, Spinner } from '../components/ui'
import { DEFAULT_MAP_CENTER } from '../config'
import { useCountdown } from '../hooks/useCountdown'
import { useGeolocation } from '../hooks/useGeolocation'
import { api } from '../services/api'
import type { EmergencyResponse } from '../types'

type Mode = 'idle' | 'crash' | 'active'

export function Emergency({ onGoDashboard }: { onGoDashboard: () => void }) {
  const [mode, setMode] = useState<Mode>('idle')
  const [emergency, setEmergency] = useState<EmergencyResponse | null>(null)
  const [activating, setActivating] = useState(false)
  const [sharing, setSharing] = useState<'ok' | 'copied' | null>(null)
  const [recovered, setRecovered] = useState(false)
  const geo = useGeolocation()

  const location = geo.position ?? { lat: DEFAULT_MAP_CENTER[0], lon: DEFAULT_MAP_CENTER[1] }
  const countdown = useCountdown(emergency?.countdown_seconds ?? 60)

  useEffect(() => {
    if (mode === 'active' && emergency) countdown.reset(emergency.countdown_seconds)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, emergency?.activated_at])

  const activate = useCallback(async () => {
    setActivating(true)
    try {
      const res = await api.activateEmergency(location.lat, location.lon)
      setEmergency(res)
      setMode('active')
      countdown.reset(res.countdown_seconds)
    } catch (e) {
      console.error(e)
    } finally {
      setActivating(false)
    }
  }, [location, countdown])

  const share = useCallback(async () => {
    if (!emergency) return
    const text = `Emergency detected.\nCurrent location: ${emergency.map_link}`
    try {
      if (navigator.share) {
        await navigator.share({ title: 'RoadSafe AI — Emergency', text, url: emergency.map_link })
        setSharing('ok')
      } else {
        await navigator.clipboard.writeText(text)
        setSharing('copied')
      }
    } catch {
      /* share cancelled */
    } finally {
      setTimeout(() => setSharing(null), 2500)
    }
  }, [emergency])

  const ring = useMemo(() => {
    const total = emergency?.countdown_seconds ?? 60
    const remaining = Math.max(0, countdown.remaining)
    const r = 62
    const circ = 2 * Math.PI * r
    return { total, remaining, circ, filled: (remaining / total) * circ }
  }, [emergency, countdown.remaining])

  return (
    <div
      className="min-h-screen pb-28 transition-colors"
      style={{ background: 'var(--bg)', color: 'var(--text)' }}
    >
      <div className="mx-auto pt-24 sm:pt-28 max-w-6xl px-4">

        {/* Header */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-red-600 text-white shadow-lg">
              <Siren size={20} />
            </span>
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: 'var(--text)' }}>
                {mode === 'active' ? 'EMERGENCY MODE' : 'Emergency Response'}
              </h1>
              <p className="text-xs" style={{ color: 'var(--text-3)' }}>
                {mode === 'active'
                  ? 'Response active — nearest hospitals ranked by road ETA.'
                  : 'When seconds matter, you shouldn’t be searching for a number.'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {mode === 'active' && emergency && (
              <div className="rounded-full bg-red-500/10 px-4 py-2 text-sm font-bold text-red-500 border border-red-500/20">
                {emergency.emergency_number} · {emergency.region}
              </div>
            )}
            <button
              onClick={onGoDashboard}
              className="cursor-pointer rounded-full px-4 py-2 text-xs font-bold transition-all shadow-sm"
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                color: 'var(--text)',
              }}
            >
              Back to Ride
            </button>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-[1fr_380px]">

          {/* Map */}
          <div
            className="relative h-[400px] overflow-hidden rounded-2xl border shadow-sm lg:h-[520px]"
            style={{ borderColor: 'var(--border)' }}
          >
            <MapView
              center={[location.lat, location.lon]}
              zoom={13}
              userLocation={location}
              hospitals={mode === 'active' ? emergency?.hospitals ?? [] : undefined}
              showHospitals={mode === 'active'}
            />
            {mode === 'idle' && (
              <div
                className="absolute left-3 top-3 z-[1000] rounded-xl px-3 py-2 text-xs font-semibold shadow backdrop-blur-md"
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  color: 'var(--text)',
                }}
              >
                <MapPin size={11} className="mr-1 inline text-blue-500" />
                Your location{geo.position ? '' : ' (demo location)'}
              </div>
            )}
          </div>

          {/* Right Panel */}
          <div className="space-y-4">
            {mode === 'idle' && (
              <section
                className="rounded-2xl p-5 shadow-sm border"
                style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
              >
                <SectionLabel>Crash detection</SectionLabel>
                <h2 className="mt-1.5 text-lg font-bold" style={{ color: 'var(--text)' }}>Simulate a collision</h2>
                <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--text-3)' }}>
                  In a real vehicle, accelerometer spikes would trigger this. For the demo, simulate it — then activate emergency response in one tap.
                </p>
                <PillButton variant="red" className="mt-4 w-full" onClick={() => setMode('crash')}>
                  <Car size={15} /> SIMULATE CRASH
                </PillButton>
                <p className="mt-3 text-[10px] leading-relaxed" style={{ color: 'var(--text-4)' }}>
                  Pipeline: sensor spike → velocity change → potential crash → driver confirmation → emergency mode.
                </p>
              </section>
            )}

            {mode === 'active' && emergency && (
              <>
                {/* Countdown */}
                <section
                  className="rounded-2xl border border-red-500/20 p-5 text-center shadow-sm"
                  style={{ background: 'var(--surface)' }}
                >
                  <div className="relative mx-auto h-[140px] w-[140px]">
                    <svg width={140} height={140} className="-rotate-90">
                      <circle cx={70} cy={70} r={58} fill="none" stroke="rgba(239,68,68,0.2)" strokeWidth={8} />
                      <circle
                        cx={70}
                        cy={70}
                        r={58}
                        fill="none"
                        stroke="#ef4444"
                        strokeWidth={8}
                        strokeLinecap="round"
                        strokeDasharray={`${ring.filled} ${ring.circ}`}
                        className="transition-all duration-1000 ease-linear"
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-red-500">Response active</span>
                      <span className="text-2xl font-black tabular-nums" style={{ color: 'var(--text)' }}>
                        {String(Math.floor(ring.remaining / 60)).padStart(2, '0')}:
                        {String(ring.remaining % 60).padStart(2, '0')}
                      </span>
                      <span className="text-[9px]" style={{ color: 'var(--text-4)' }}>until ETA estimate refreshes</span>
                    </div>
                  </div>
                  <div
                    className="mt-3 rounded-xl p-3 text-left border"
                    style={{ background: 'var(--bg-2)', borderColor: 'var(--border)' }}
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span style={{ color: 'var(--text-3)' }}>Nearest hospital</span>
                      <span className="font-bold" style={{ color: 'var(--text)' }}>
                        {emergency.hospitals[0]?.name ?? '—'}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-xs">
                      <span style={{ color: 'var(--text-3)' }}>Estimated road ETA</span>
                      <span className="text-lg font-black text-red-500">{emergency.hospitals[0]?.eta_min} min</span>
                    </div>
                  </div>
                </section>

                {/* Actions */}
                <section
                  className="rounded-2xl p-4 shadow-sm border"
                  style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
                >
                  <SectionLabel>One-tap actions</SectionLabel>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <a
                      href={`tel:${emergency.emergency_number}`}
                      className="flex cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-red-600 py-3 text-xs font-bold text-white hover:bg-red-500 shadow-md"
                    >
                      <PhoneCall size={14} /> Call {emergency.emergency_number}
                    </a>
                    <button
                      onClick={share}
                      className="flex cursor-pointer items-center justify-center gap-1.5 rounded-xl py-3 text-xs font-bold text-white shadow-md"
                      style={{ background: 'var(--text)' }}
                    >
                      {sharing === 'copied' ? <ClipboardCopy size={14} /> : sharing === 'ok' ? <CheckCircle2 size={14} /> : <Share2 size={14} />}
                      {sharing === 'copied' ? 'Copied!' : sharing === 'ok' ? 'Shared!' : 'Share location'}
                    </button>
                    <a
                      href={emergency.map_link}
                      target="_blank"
                      rel="noreferrer"
                      className="flex cursor-pointer items-center justify-center gap-1.5 rounded-xl py-3 text-xs font-semibold border transition-all"
                      style={{ background: 'var(--bg-2)', borderColor: 'var(--border)', color: 'var(--text)' }}
                    >
                      <ExternalLink size={13} /> Open map
                    </a>
                    <button
                      onClick={() => setMode('idle')}
                      className="flex cursor-pointer items-center justify-center gap-1.5 rounded-xl py-3 text-xs font-semibold border text-red-500 transition-all"
                      style={{ background: 'var(--bg-2)', borderColor: 'var(--border)' }}
                    >
                      Cancel mode
                    </button>
                  </div>
                </section>
              </>
            )}

            {/* Hospital Ranking List */}
            {mode === 'active' && emergency && (
              <section
                className="rounded-2xl p-4 shadow-sm border max-h-64 overflow-y-auto slim-scroll"
                style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
              >
                <SectionLabel>Ranked Hospitals ({emergency.hospitals.length})</SectionLabel>
                <div className="mt-2 space-y-2">
                  {emergency.hospitals.map((h, i) => (
                    <div
                      key={h.id}
                      className="flex items-center justify-between rounded-xl p-2.5 border"
                      style={{ background: 'var(--bg-2)', borderColor: 'var(--border)' }}
                    >
                      <div>
                        <div className="text-xs font-bold" style={{ color: 'var(--text)' }}>
                          {i + 1}. {h.name}
                        </div>
                        <div className="text-[10px]" style={{ color: 'var(--text-4)' }}>
                          {h.distance_km.toFixed(1)} km · {h.type}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-black text-red-500">{h.eta_min} min</div>
                        <div className="text-[9px] font-semibold text-green-500">Fastest ETA</div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
