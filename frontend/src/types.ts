export type LatLng = [number, number]

export type RiskLevel = 'SAFE' | 'MODERATE' | 'HIGH' | 'CRITICAL'

export type HazardType =
  | 'pothole'
  | 'poor_lighting'
  | 'accident'
  | 'road_blockage'
  | 'construction'
  | 'flooding'
  | 'dangerous_intersection'

export type HazardSeverity = 'low' | 'medium' | 'high'

export interface Hazard {
  id: string
  type: HazardType
  severity: HazardSeverity
  lat: number
  lon: number
  description: string
  source: 'demo' | 'user'
  reported_at: string
  distance_m?: number | null
}

export interface FactorExplanation {
  factor: string
  score: number
  impact: number
  detail: string
}

export interface Segment {
  id: number
  name: string
  geometry: LatLng[]
  start: LatLng
  end: LatLng
  distance_km: number
  safety_score: number
  risk_level: RiskLevel
  risk_color: string
  factors: Record<string, number>
  explanation: FactorExplanation[]
  recommendation: string
  hazards: Hazard[]
}

export interface RouteResponse {
  source: 'live' | 'demo'
  provider: string
  start: LatLng
  end: LatLng
  distance_km: number
  duration_min: number
  geometry: LatLng[]
  segments: Segment[]
  overall_score: number
  overall_risk: RiskLevel
  overall_color: string
  hazards: Hazard[]
  weather?: {
    main: string
    description: string
    temp_c: number
    is_night: boolean
    source: 'live' | 'demo'
  } | null
  computed_at: string
}

export interface Hospital {
  id: string
  name: string
  address: string
  lat: number
  lon: number
  distance_km: number
  eta_min: number
  phone: string
  source: 'live' | 'demo'
  eta_source: 'live' | 'estimated'
}

export interface EmergencyResponse {
  emergency_number: string
  region: string
  message: string
  map_link: string
  countdown_seconds: number
  hospitals: Hospital[]
  activated_at: string
}

export type FatigueStateName =
  | 'IDLE'
  | 'NORMAL'
  | 'QUESTION'
  | 'WAITING_FOR_RESPONSE'
  | 'ANALYZE_RESPONSE'
  | 'CAUTION'
  | 'ESCALATE'

export interface FatigueState {
  session_id: string
  state: FatigueStateName
  escalation_level: number
  fatigue_confidence: number
  slow_responses: number
  missed_responses: number
  questions_asked: number
  last_question: string
  message: string
  latency_band?: string | null
}

export interface FatigueThresholds {
  normal_max: number
  mild_max: number
  elevated_max: number
  max_wait_seconds: number
  min_response_duration: number
}

export interface GeocodeResult {
  name: string
  latitude: number
  longitude: number
  formattedAddress: string
}

export interface Place {
  label: string
  sublabel: string
  lat: number
  lon: number
  city: string
  name?: string
  formattedAddress?: string
}

