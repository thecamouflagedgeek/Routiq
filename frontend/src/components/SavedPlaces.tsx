import { useEffect, useState } from 'react'
import { Briefcase, Edit2, Home, Save, X } from 'lucide-react'
import type { Place } from '../types'
import { PLACES } from '../config'

interface Props {
  onSelectPlace: (place: Place) => void
}

const DEFAULT_HOME: Place = {
  label: 'Home',
  sublabel: 'Malad West, Mumbai',
  lat: 19.186,
  lon: 72.8485,
  city: 'Mumbai',
  name: 'Malad West',
}

const DEFAULT_WORK: Place = {
  label: 'Work',
  sublabel: 'BKC, Bandra East, Mumbai',
  lat: 19.0657,
  lon: 72.8687,
  city: 'Mumbai',
  name: 'BKC Bandra East',
}

export function SavedPlaces({ onSelectPlace }: Props) {
  const [home, setHome] = useState<Place>(DEFAULT_HOME)
  const [work, setWork] = useState<Place>(DEFAULT_WORK)
  const [editingType, setEditingType] = useState<'home' | 'work' | null>(null)
  const [customName, setCustomName] = useState('')
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null)

  useEffect(() => {
    try {
      const savedHome = localStorage.getItem('routiq_home_place')
      if (savedHome) setHome(JSON.parse(savedHome))
      const savedWork = localStorage.getItem('routiq_work_place')
      if (savedWork) setWork(JSON.parse(savedWork))
    } catch (e) {
      console.error(e)
    }
  }, [])

  const handleSaveConfig = () => {
    if (!editingType) return
    const target = selectedPlace ?? (editingType === 'home' ? home : work)
    const updated: Place = {
      ...target,
      label: editingType === 'home' ? 'Home' : 'Work',
      sublabel: customName.trim() || target.sublabel || target.name || 'Saved Address',
    }
    if (editingType === 'home') {
      setHome(updated)
      localStorage.setItem('routiq_home_place', JSON.stringify(updated))
    } else {
      setWork(updated)
      localStorage.setItem('routiq_work_place', JSON.stringify(updated))
    }
    setEditingType(null)
    setCustomName('')
    setSelectedPlace(null)
  }

  return (
    <div
      className="rounded-2xl p-3.5 border transition-all"
      style={{ background: '#1a1e27', borderColor: 'rgba(255,255,255,0.08)' }}
    >
      <div className="mb-2.5 flex items-center justify-between">
        <span className="text-[10px] font-extrabold uppercase tracking-widest" style={{ color: '#5d6472' }}>
          Saved Places
        </span>
        <span className="text-[9px] font-medium" style={{ color: '#8b93a3' }}>
          Tap to navigate
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        {/* HOME BUTTON */}
        <div
          className="group relative flex flex-col justify-between rounded-xl p-3 border transition-all cursor-pointer hover:border-blue-500/40"
          style={{ background: '#14171f', borderColor: 'rgba(255,255,255,0.08)' }}
          onClick={() => onSelectPlace(home)}
        >
          <div className="flex items-center justify-between">
            <span
              className="flex h-9 w-9 items-center justify-center rounded-lg"
              style={{ background: 'rgba(59,130,246,0.16)', color: '#3b82f6' }}
            >
              <Home size={17} />
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation()
                setEditingType('home')
                setCustomName(home.sublabel)
              }}
              className="cursor-pointer p-1 text-xs transition-opacity opacity-50 hover:opacity-100"
              style={{ color: '#8b93a3' }}
              title="Edit Home"
            >
              <Edit2 size={12} />
            </button>
          </div>
          <div className="mt-2.5">
            <div className="text-sm font-black text-white">Home</div>
            <div className="mt-0.5 truncate text-[10px] font-medium" style={{ color: '#8b93a3' }}>
              {home.sublabel}
            </div>
          </div>
        </div>

        {/* WORK BUTTON */}
        <div
          className="group relative flex flex-col justify-between rounded-xl p-3 border transition-all cursor-pointer hover:border-amber-500/40"
          style={{ background: '#14171f', borderColor: 'rgba(255,255,255,0.08)' }}
          onClick={() => onSelectPlace(work)}
        >
          <div className="flex items-center justify-between">
            <span
              className="flex h-9 w-9 items-center justify-center rounded-lg"
              style={{ background: 'rgba(245,158,11,0.16)', color: '#f59e0b' }}
            >
              <Briefcase size={17} />
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation()
                setEditingType('work')
                setCustomName(work.sublabel)
              }}
              className="cursor-pointer p-1 text-xs transition-opacity opacity-50 hover:opacity-100"
              style={{ color: '#8b93a3' }}
              title="Edit Work"
            >
              <Edit2 size={12} />
            </button>
          </div>
          <div className="mt-2.5">
            <div className="text-sm font-black text-white">Work</div>
            <div className="mt-0.5 truncate text-[10px] font-medium" style={{ color: '#8b93a3' }}>
              {work.sublabel}
            </div>
          </div>
        </div>
      </div>

      {/* EDIT LOCATION MODAL */}
      {editingType && (
        <div className="mt-3 rounded-xl p-3 border border-blue-500/30" style={{ background: '#14171f' }}>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-bold text-white">
              Set {editingType === 'home' ? 'Home' : 'Work'} Location
            </span>
            <button onClick={() => setEditingType(null)} className="cursor-pointer p-1" style={{ color: '#8b93a3' }}>
              <X size={13} />
            </button>
          </div>

          <div className="space-y-2">
            <input
              type="text"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              placeholder="e.g. Malad West, Mumbai"
              className="w-full rounded-lg px-2.5 py-1.5 text-xs border outline-none"
              style={{ background: '#1a1e27', borderColor: 'rgba(255,255,255,0.1)', color: '#ffffff' }}
            />

            <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#5d6472' }}>
              Quick Presets:
            </div>
            <div className="flex flex-wrap gap-1">
              {PLACES.slice(0, 4).map((p) => (
                <button
                  key={p.label}
                  onClick={() => {
                    setSelectedPlace(p)
                    setCustomName(p.sublabel)
                  }}
                  className="rounded-md px-2 py-1 text-[10px] font-semibold border cursor-pointer transition-colors hover:bg-white/5"
                  style={{ background: '#1a1e27', borderColor: 'rgba(255,255,255,0.1)', color: '#c7ccd6' }}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <button
              onClick={handleSaveConfig}
              className="mt-2 flex w-full cursor-pointer items-center justify-center gap-1 rounded-lg py-1.5 text-xs font-extrabold text-white bg-blue-600 hover:bg-blue-700"
            >
              <Save size={12} /> Save {editingType === 'home' ? 'Home' : 'Work'} Location
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
