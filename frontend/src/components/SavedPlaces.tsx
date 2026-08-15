import { useEffect, useState } from 'react'
import { Briefcase, Edit2, Home, MapPin, Plus, Save, X } from 'lucide-react'
import type { Place } from '../types'
import { PLACES } from '../config'

interface Props {
  onSelectPlace: (place: Place) => void
}

const DEFAULT_HOME: Place = {
  label: 'Home',
  sublabel: 'Bandra West, Mumbai',
  lat: 19.0596,
  lon: 72.8295,
  city: 'Mumbai',
  name: 'Bandra West',
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
      className="rounded-2xl p-3 shadow-sm border transition-all"
      style={{ background: 'var(--bg-2)', borderColor: 'var(--border)' }}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[10px] font-extrabold uppercase tracking-widest" style={{ color: 'var(--text-4)' }}>
          Saved Places
        </span>
        <span className="text-[9px] font-medium" style={{ color: 'var(--text-4)' }}>
          Tap to navigate
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {/* HOME BUTTON */}
        <div
          className="group relative flex flex-col justify-between rounded-xl p-3 border transition-all cursor-pointer hover:border-blue-500/50"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
          onClick={() => onSelectPlace(home)}
        >
          <div className="flex items-center justify-between">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-500/10 text-blue-500">
              <Home size={15} />
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation()
                setEditingType('home')
                setCustomName(home.sublabel)
              }}
              className="opacity-60 hover:opacity-100 p-1 text-xs"
              style={{ color: 'var(--text-3)' }}
              title="Edit Home"
            >
              <Edit2 size={12} />
            </button>
          </div>
          <div className="mt-2.5">
            <div className="text-xs font-black" style={{ color: 'var(--text)' }}>
              Home
            </div>
            <div className="mt-0.5 text-[10px] truncate" style={{ color: 'var(--text-3)' }}>
              {home.sublabel}
            </div>
          </div>
        </div>

        {/* WORK BUTTON */}
        <div
          className="group relative flex flex-col justify-between rounded-xl p-3 border transition-all cursor-pointer hover:border-amber-500/50"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
          onClick={() => onSelectPlace(work)}
        >
          <div className="flex items-center justify-between">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-500/10 text-amber-500">
              <Briefcase size={15} />
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation()
                setEditingType('work')
                setCustomName(work.sublabel)
              }}
              className="opacity-60 hover:opacity-100 p-1 text-xs"
              style={{ color: 'var(--text-3)' }}
              title="Edit Work"
            >
              <Edit2 size={12} />
            </button>
          </div>
          <div className="mt-2.5">
            <div className="text-xs font-black" style={{ color: 'var(--text)' }}>
              Work
            </div>
            <div className="mt-0.5 text-[10px] truncate" style={{ color: 'var(--text-3)' }}>
              {work.sublabel}
            </div>
          </div>
        </div>
      </div>

      {/* EDIT LOCATION MODAL */}
      {editingType && (
        <div className="mt-3 rounded-xl p-3 border border-blue-500/30" style={{ background: 'var(--surface)' }}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold" style={{ color: 'var(--text)' }}>
              Set {editingType === 'home' ? 'Home' : 'Work'} Location
            </span>
            <button onClick={() => setEditingType(null)} className="p-1" style={{ color: 'var(--text-3)' }}>
              <X size={13} />
            </button>
          </div>

          <div className="space-y-2">
            <input
              type="text"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              placeholder="e.g. Bandra West, Mumbai"
              className="w-full rounded-lg px-2.5 py-1.5 text-xs border outline-none"
              style={{ background: 'var(--bg-2)', borderColor: 'var(--border)', color: 'var(--text)' }}
            />

            <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-4)' }}>
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
                  className="rounded-md px-2 py-1 text-[10px] font-semibold border cursor-pointer"
                  style={{ background: 'var(--bg-2)', borderColor: 'var(--border)', color: 'var(--text-2)' }}
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
