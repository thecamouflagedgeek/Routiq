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

  const accent = variant === 'start' ? '#ff6600' : '#8b5cf6'
  const AccentIcon = variant === 'start' ? MapPin : Navigation

  return (
    <div ref={boxRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex w-full cursor-pointer items-center gap-2.5 rounded-2xl border px-4 py-3 text-left transition-all ${
          picking ? 'ring-2' : 'hover:bg-white/5'
        }`}
        style={{
          background: '#1a1e27',
          borderColor: picking ? 'rgba(255,102,0,0.55)' : 'rgba(255,255,255,0.08)',
          color: '#ffffff',
        }}
      >
        <AccentIcon size={16} className="shrink-0" style={{ color: accent }} />
        <span
          className="flex-1 truncate text-xs font-bold"
          style={{ color: value ? '#ffffff' : '#5d6472' }}
        >
          {picking ? 'Click anywhere on the map…' : value?.label || placeholder}
        </span>
        {picking ? (
          <X size={14} style={{ color: accent }} />
        ) : (
          <ChevronDown size={14} style={{ color: '#5d6472' }} />
        )}
      </button>

      {open && (
        <div
          className="slide-in-up absolute left-0 right-0 top-full z-[1300] mt-2 overflow-hidden rounded-2xl border shadow-2xl"
          style={{
            background: '#1e222b',
            borderColor: 'rgba(255,255,255,0.12)',
            boxShadow: '0 22px 60px rgba(0,0,0,0.8)',
          }}
        >
          <div className="p-2.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <div className="relative flex items-center">
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search Mumbai location (e.g., Dadar, Bandra, BKC)…"
                className="w-full rounded-xl px-3.5 py-2.5 text-xs font-bold outline-none border transition-all"
                style={{
                  background: '#14171f',
                  color: '#ffffff',
                  borderColor: 'rgba(255,255,255,0.1)',
                }}
              />
              {loading && <Loader2 size={14} className="absolute right-3 animate-spin" style={{ color: '#ff6600' }} />}
            </div>
            {error && <div className="mt-1.5 px-2 text-[10px] font-semibold text-amber-400">{error}</div>}
          </div>

          <div className="slim-scroll max-h-64 overflow-y-auto p-1.5">
            {displayList.map((p, idx) => (
              <button
                key={`${p.lat}-${p.lon}-${idx}`}
                onClick={() => {
                  onSelect(p)
                  setOpen(false)
                  setQuery('')
                }}
                className="flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-white/5"
              >
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
                  style={{ background: '#14171f', color: '#c7ccd6' }}
                >
                  {variant === 'start' ? <MapPin size={14} style={{ color: '#ff6600' }} /> : <Navigation size={14} style={{ color: '#8b5cf6' }} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-bold text-white">
                    {p.name || p.sublabel || p.label}
                  </span>
                  <span className="block truncate text-[10px] font-medium" style={{ color: '#8b93a3' }}>
                    {p.formattedAddress || p.label}
                  </span>
                </span>
              </button>
            ))}

            {!loading && displayList.length === 0 && (
              <div className="px-3 py-4 text-center text-xs font-medium" style={{ color: '#8b93a3' }}>
                No matching locations found in Mumbai
              </div>
            )}
          </div>

          <div className="p-1.5" style={{ borderTop: '1px solid rgba(255,255,255,0.08)', background: '#14171f' }}>
            <button
              onClick={() => {
                onUseMyLocation()
                setOpen(false)
              }}
              className="flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-bold transition-colors hover:bg-blue-500/10"
              style={{ color: '#ffffff' }}
            >
              <Crosshair size={14} className="text-blue-500" /> Use my current location
            </button>
            <button
              onClick={() => {
                onPickOnMap()
                setOpen(false)
              }}
              className="flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-bold transition-colors hover:bg-white/5"
              style={{ color: '#ffffff' }}
            >
              <MapPin size={14} style={{ color: '#ff6600' }} /> Choose location on map
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

