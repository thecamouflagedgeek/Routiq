import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Crosshair, Loader2, MapPin, Navigation, X } from 'lucide-react'
import { PLACES } from '../config'
import { api } from '../services/api'
import type { Place } from '../types'

interface Props {
  value: Place | null
  placeholder: string
  variant: 'start' | 'end'
  onSelect: (place: Place) => void
  onUseMyLocation: () => void
  onPickOnMap: () => void
  picking?: boolean
}

export function PlaceAutocomplete({
  value,
  placeholder,
  variant,
  onSelect,
  onUseMyLocation,
  onPickOnMap,
  picking,
}: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [searchResults, setSearchResults] = useState<Place[]>([])
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  // Debounced geocoding search
  useEffect(() => {
    if (!query.trim()) {
      setSearchResults([])
      setLoading(false)
      setError('')
      return
    }

    const timer = setTimeout(async () => {
      setLoading(true)
      setError('')
      try {
        const results = await api.geocode(query.trim())
        const mapped: Place[] = results.map((r) => ({
          label: r.formattedAddress,
          sublabel: r.name,
          lat: r.latitude,
          lon: r.longitude,
          city: 'Mumbai',
          name: r.name,
          formattedAddress: r.formattedAddress,
        }))

        // Fallback filter over PLACES if external API yields no results
        if (mapped.length === 0) {
          const localFiltered = PLACES.filter(
            (p) =>
              p.label.toLowerCase().includes(query.toLowerCase()) ||
              p.sublabel.toLowerCase().includes(query.toLowerCase()),
          )
          setSearchResults(localFiltered)
        } else {
          setSearchResults(mapped)
        }
      } catch (err) {
        console.error('Geocoding error:', err)
        // Fallback to local filtering on error
        const localFiltered = PLACES.filter(
          (p) =>
            p.label.toLowerCase().includes(query.toLowerCase()) ||
            p.sublabel.toLowerCase().includes(query.toLowerCase()),
        )
        setSearchResults(localFiltered)
        setError('Using offline search')
      } finally {
        setLoading(false)
      }
    }, 280)

    return () => clearTimeout(timer)
  }, [query])

  const displayList = query.trim() ? searchResults : PLACES

  return (
    <div ref={boxRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex w-full cursor-pointer items-center gap-2.5 rounded-full border px-4 py-3 text-left shadow-sm transition-all ${
          picking
            ? 'border-orange-400 ring-2 ring-orange-100'
            : 'hover:opacity-90'
        }`}
        style={{
          background: 'var(--surface)',
          borderColor: 'var(--border)',
          color: 'var(--text)',
        }}
      >
        {variant === 'start' ? (
          <MapPin size={16} className="shrink-0 text-orange-500" />
        ) : (
          <Navigation size={16} className="shrink-0 text-orange-500" />
        )}
        <span className="flex-1 truncate text-xs font-bold" style={{ color: value ? 'var(--text)' : 'var(--text-3)' }}>
          {picking ? 'Click anywhere on the map…' : value?.label || placeholder}
        </span>
        {picking ? <X size={14} className="text-orange-500" /> : <ChevronDown size={14} style={{ color: 'var(--text-3)' }} />}
      </button>

      {open && (
        <div
          className="slide-in-up absolute left-0 right-0 top-full z-[1300] mt-2 overflow-hidden rounded-2xl border shadow-2xl backdrop-blur-md"
          style={{
            background: 'var(--surface)',
            borderColor: 'var(--border)',
            boxShadow: 'var(--shadow-xl)',
          }}
        >
          <div className="p-2.5" style={{ borderBottom: '1px solid var(--border)' }}>
            <div className="relative flex items-center">
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search Mumbai location (e.g., Dadar, Bandra, BKC)…"
                className="w-full rounded-xl px-3.5 py-2.5 text-xs font-bold outline-none border transition-all"
                style={{
                  background: 'var(--bg-2)',
                  color: 'var(--text)',
                  borderColor: 'var(--border)',
                }}
              />
              {loading && <Loader2 size={14} className="absolute right-3 animate-spin text-orange-500" />}
            </div>
            {error && <div className="mt-1.5 px-2 text-[10px] font-semibold text-amber-500">{error}</div>}
          </div>

          <div className="max-h-64 overflow-y-auto p-1.5 slim-scroll">
            {displayList.map((p, idx) => (
              <button
                key={`${p.lat}-${p.lon}-${idx}`}
                onClick={() => {
                  onSelect(p)
                  setOpen(false)
                  setQuery('')
                }}
                className="flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-orange-500/10"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full" style={{ background: 'var(--bg-2)', color: 'var(--text-2)' }}>
                  {variant === 'start' ? <MapPin size={14} /> : <Navigation size={14} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-bold" style={{ color: 'var(--text)' }}>
                    {p.name || p.sublabel || p.label}
                  </span>
                  <span className="block truncate text-[10px] font-medium" style={{ color: 'var(--text-3)' }}>
                    {p.formattedAddress || p.label}
                  </span>
                </span>
              </button>
            ))}

            {!loading && displayList.length === 0 && (
              <div className="px-3 py-4 text-center text-xs font-medium" style={{ color: 'var(--text-3)' }}>
                No matching locations found in Mumbai
              </div>
            )}
          </div>

          <div className="p-1.5" style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-2)' }}>
            <button
              onClick={() => {
                onUseMyLocation()
                setOpen(false)
              }}
              className="flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-bold transition-colors hover:bg-blue-500/10"
              style={{ color: 'var(--text)' }}
            >
              <Crosshair size={14} className="text-blue-500" /> Use my current location
            </button>
            <button
              onClick={() => {
                onPickOnMap()
                setOpen(false)
              }}
              className="flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-bold transition-colors hover:bg-orange-500/10"
              style={{ color: 'var(--text)' }}
            >
              <MapPin size={14} className="text-orange-500" /> Choose location on map
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

