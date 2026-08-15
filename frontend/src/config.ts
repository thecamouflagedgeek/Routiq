import type { HazardSeverity, HazardType, Place, RiskLevel } from './types'

export const API_BASE = import.meta.env.VITE_API_URL || '/api'

// ---------------------------------------------------------------------------
// Risk palette (matches backend risk_level_for thresholds)
// ---------------------------------------------------------------------------
export const RISK_META: Record<RiskLevel, { color: string; label: string; text: string }> = {
  SAFE: { color: '#22c55e', label: 'SAFE', text: 'text-green-600' },
  MODERATE: { color: '#facc15', label: 'MODERATE', text: 'text-yellow-500' },
  HIGH: { color: '#f97316', label: 'HIGH', text: 'text-orange-500' },
  CRITICAL: { color: '#ef4444', label: 'CRITICAL', text: 'text-red-500' },
}

// ---------------------------------------------------------------------------
// Fatigue thresholds — configurable here (and mirrored to the backend on
// session creation).
// normal ≤3s · mild ≤6s · elevated ≤10s · severe >10s · max wait 12s
// ---------------------------------------------------------------------------
export const DEFAULT_THRESHOLDS = {
  normal_max: 3,
  mild_max: 6,
  elevated_max: 10,
  max_wait_seconds: 12,
  min_response_duration: 0.8,
}

export function latencyBand(
  latency: number,
  t: typeof DEFAULT_THRESHOLDS,
): { band: 'NORMAL' | 'MILD' | 'ELEVATED' | 'SEVERE'; color: string; label: string } {
  if (latency <= t.normal_max) return { band: 'NORMAL', color: '#22c55e', label: 'Normal response' }
  if (latency <= t.mild_max) return { band: 'MILD', color: '#eab308', label: 'Mild concern' }
  if (latency <= t.elevated_max) return { band: 'ELEVATED', color: '#f97316', label: 'Elevated concern' }
  return { band: 'SEVERE', color: '#ef4444', label: 'Severe concern' }
}

// ---------------------------------------------------------------------------
// Demo places for the start/destination picker (defaults match the reference
// design: Beverly Hills -> Santa Monica)
// ---------------------------------------------------------------------------
export const PLACES: Place[] = [
  {
    label: 'Bandra West, Mumbai, Maharashtra, India',
    sublabel: 'Bandra West, Mumbai',
    lat: 19.0596,
    lon: 72.8295,
    city: 'Mumbai',
    name: 'Bandra West',
    formattedAddress: 'Bandra West, Mumbai, Maharashtra, India',
  },
  {
    label: 'Malad West, Mumbai, Maharashtra, India',
    sublabel: 'Malad West, Mumbai',
    lat: 19.1860,
    lon: 72.8485,
    city: 'Mumbai',
    name: 'Malad West',
    formattedAddress: 'Malad West, Mumbai, Maharashtra, India',
  },
  {
    label: 'Andheri East, Mumbai, Maharashtra, India',
    sublabel: 'Andheri East, Mumbai',
    lat: 19.1136,
    lon: 72.8697,
    city: 'Mumbai',
    name: 'Andheri East',
    formattedAddress: 'Andheri East, Mumbai, Maharashtra, India',
  },
  {
    label: 'Borivali West, Mumbai, Maharashtra, India',
    sublabel: 'Borivali West, Mumbai',
    lat: 19.2307,
    lon: 72.8567,
    city: 'Mumbai',
    name: 'Borivali West',
    formattedAddress: 'Borivali West, Mumbai, Maharashtra, India',
  },
  {
    label: 'Dadar West, Mumbai, Maharashtra, India',
    sublabel: 'Dadar West, Mumbai',
    lat: 19.0178,
    lon: 72.8478,
    city: 'Mumbai',
    name: 'Dadar West',
    formattedAddress: 'Dadar West, Mumbai, Maharashtra, India',
  },
  {
    label: 'Goregaon East, Mumbai, Maharashtra, India',
    sublabel: 'Goregaon East, Mumbai',
    lat: 19.1663,
    lon: 72.8526,
    city: 'Mumbai',
    name: 'Goregaon East',
    formattedAddress: 'Goregaon East, Mumbai, Maharashtra, India',
  },
  {
    label: 'Kandivali West, Mumbai, Maharashtra, India',
    sublabel: 'Kandivali West, Mumbai',
    lat: 19.2074,
    lon: 72.8349,
    city: 'Mumbai',
    name: 'Kandivali West',
    formattedAddress: 'Kandivali West, Mumbai, Maharashtra, India',
  },
  {
    label: 'Powai, Mumbai, Maharashtra, India',
    sublabel: 'Powai, Mumbai',
    lat: 19.1176,
    lon: 72.9060,
    city: 'Mumbai',
    name: 'Powai',
    formattedAddress: 'Powai, Mumbai, Maharashtra, India',
  },
]

export const DEFAULT_START = PLACES[0]
export const DEFAULT_END = PLACES[1]

export const DEFAULT_MAP_CENTER: [number, number] = [19.1000, 72.8500]
export const DEFAULT_ZOOM = 12

// ---------------------------------------------------------------------------
// Emergency
// ---------------------------------------------------------------------------

// Hospital search radius the backend queries OpenStreetMap/Overpass with.
export const EMERGENCY_SEARCH_RADIUS_KM = 15

// Development-only GPS override: set VITE_DEV_LOCATION="lat,lon" to simulate a
// GPS fix when the browser cannot provide one (e.g. non-HTTPS local testing).
// Never used when a real GPS fix exists.
const _devLocRaw = import.meta.env.VITE_DEV_LOCATION as string | undefined
const _devLocParts = (_devLocRaw ?? '').split(',').map((p) => Number(p.trim()))
export const DEV_LOCATION: { lat: number; lon: number } | null =
  _devLocParts.length === 2 &&
  Number.isFinite(_devLocParts[0]) &&
  Number.isFinite(_devLocParts[1]) &&
  Math.abs(_devLocParts[0]) <= 90 &&
  Math.abs(_devLocParts[1]) <= 180
    ? { lat: _devLocParts[0], lon: _devLocParts[1] }
    : null

// ---------------------------------------------------------------------------
// Hazard metadata
// ---------------------------------------------------------------------------
export const HAZARD_TYPES: { value: HazardType; label: string }[] = [
  { value: 'pothole', label: 'Pothole' },
  { value: 'poor_lighting', label: 'Poor lighting' },
  { value: 'accident', label: 'Accident' },
  { value: 'road_blockage', label: 'Road blockage' },
  { value: 'construction', label: 'Construction' },
  { value: 'flooding', label: 'Flooding' },
  { value: 'dangerous_intersection', label: 'Dangerous intersection' },
]

export const SEVERITY_META: Record<HazardSeverity, { color: string; label: string; bg: string }> = {
  low: { color: '#eab308', label: 'Low', bg: 'bg-yellow-100 text-yellow-700' },
  medium: { color: '#f97316', label: 'Medium', bg: 'bg-orange-100 text-orange-700' },
  high: { color: '#ef4444', label: 'High', bg: 'bg-red-100 text-red-700' },
}

export const HAZARD_ICON_COLOR: Record<HazardType, string> = {
  pothole: '#f97316',
  poor_lighting: '#a16207',
  accident: '#ef4444',
  road_blockage: '#dc2626',
  construction: '#f59e0b',
  flooding: '#3b82f6',
  dangerous_intersection: '#7c3aed',
}

// ---------------------------------------------------------------------------
// Misc UI strings
// ---------------------------------------------------------------------------
export const DISCLAIMER =
  'AI-estimated road risk. This is a hackathon prototype — scores are estimates, not guarantees.'
