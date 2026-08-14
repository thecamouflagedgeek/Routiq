import { useState } from 'react'
import { Crosshair, Loader2, MapPin, Send, X } from 'lucide-react'
import { HAZARD_TYPES, SEVERITY_META } from '../config'
import { api } from '../services/api'
import type { Hazard, HazardSeverity, HazardType } from '../types'
import { SectionLabel } from './ui'

interface Props {
  open: boolean
  onClose: () => void
  defaultLocation: { lat: number; lon: number } | null
  onPicking: (active: boolean) => void
  picking: boolean
  onPickFromMap: () => void
  onUseMyLocation: () => void
  onSubmitted: (hazard: Hazard) => void
  preset?: { type?: HazardType; lat?: number; lon?: number }
}

export function HazardForm({
  open,
  onClose,
  defaultLocation,
  picking,
  onPickFromMap,
  onUseMyLocation,
  onSubmitted,
  preset,
}: Omit<Props, 'onPicking'>) {
  const [type, setType] = useState<HazardType>(preset?.type ?? 'pothole')
  const [severity, setSeverity] = useState<HazardSeverity>('medium')
  const [description, setDescription] = useState('')
  const location = defaultLocation

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  if (!open) return null

  const locationLabel = location
    ? `${location.lat.toFixed(4)}, ${location.lon.toFixed(4)}`
    : 'No location set'

  const submit = async () => {
    if (!location) {
      setError('Pick a location on the map first.')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const created = await api.submitHazard({
        type,
        severity,
        lat: location.lat,
        lon: location.lon,
        description: description.trim(),
      })
      onSubmitted(created)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to submit hazard')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[1400] flex items-center justify-center bg-black/35 p-4"
      onClick={picking ? undefined : onClose}
    >
      <div
        className="slide-in-up w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-neutral-900">Report Hazard</h2>
            <p className="text-xs text-neutral-400">Help other drivers — reports appear on the map instantly.</p>
          </div>
          <button onClick={onClose} className="cursor-pointer rounded-full p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-900">
            <X size={17} />
          </button>
        </div>

        <div className="mb-3">
          <SectionLabel>Type</SectionLabel>
          <div className="mt-1.5 grid grid-cols-2 gap-1.5">
            {HAZARD_TYPES.map((t) => (
              <button
                key={t.value}
                onClick={() => setType(t.value)}
                className={`cursor-pointer rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors ${
                  type === t.value
                    ? 'border-neutral-900 bg-neutral-900 text-white'
                    : 'border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-3">
          <SectionLabel>Severity</SectionLabel>
          <div className="mt-1.5 flex gap-1.5">
            {(Object.keys(SEVERITY_META) as HazardSeverity[]).map((s) => (
              <button
                key={s}
                onClick={() => setSeverity(s)}
                className={`flex-1 cursor-pointer rounded-lg border py-1.5 text-xs font-semibold transition-colors ${
                  severity === s
                    ? 'border-transparent text-white'
                    : 'border-neutral-200 bg-white text-neutral-600'
                }`}
                style={severity === s ? { backgroundColor: SEVERITY_META[s].color } : undefined}
              >
                {SEVERITY_META[s].label}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-3">
          <SectionLabel>Location</SectionLabel>
          <div className="mt-1.5 flex items-center gap-2 rounded-lg border border-neutral-200 px-3 py-2">
            <MapPin size={14} className="shrink-0 text-neutral-400" />
            <span className={`flex-1 truncate text-xs font-medium ${location ? 'text-neutral-900' : 'text-neutral-400'}`}>
              {locationLabel}
            </span>
            {picking && <span className="text-[10px] font-bold text-orange-500 animate-pulse">PICK ON MAP…</span>}
          </div>
          <div className="mt-1.5 flex gap-1.5">
            <button
              onClick={onPickFromMap}
              className="flex flex-1 cursor-pointer items-center justify-center gap-1 rounded-lg bg-neutral-100 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-200"
            >
              <MapPin size={12} /> Pick on map
            </button>
            <button
              onClick={onUseMyLocation}
              className="flex flex-1 cursor-pointer items-center justify-center gap-1 rounded-lg bg-neutral-100 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-200"
            >
              <Crosshair size={12} /> My location
            </button>
          </div>
        </div>

        <div className="mb-4">
          <SectionLabel>Description (optional)</SectionLabel>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Deep pothole on the right lane"
            className="mt-1.5 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none placeholder:text-neutral-400 focus:border-neutral-400"
          />
        </div>

        {error && <p className="mb-2 text-xs font-medium text-red-500">{error}</p>}

        <button
          onClick={submit}
          disabled={submitting}
          className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-neutral-900 py-3 text-sm font-bold text-white transition-colors hover:bg-neutral-700 disabled:opacity-60"
        >
          {submitting ? <Loader2 size={15} className="animate-spin" /> : <Send size={14} />}
          Submit report
        </button>
      </div>
    </div>
  )
}
