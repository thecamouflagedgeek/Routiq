import { API_BASE } from '../config'
import type {
  EmergencyResponse,
  EmergencyRoute,
  FatigueState,
  GeocodeResult,
  Hazard,
  Hospital,
  RouteResponse,
} from '../types'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`API ${res.status}: ${body.slice(0, 200)}`)
  }
  return res.json() as Promise<T>
}

export const api = {
  geocode(query: string): Promise<GeocodeResult[]> {
    return request<GeocodeResult[]>(`/geocode?q=${encodeURIComponent(query)}`)
  },

  getRoute(start: [number, number], end: [number, number]): Promise<RouteResponse> {
    const q = `start_lat=${start[0]}&start_lon=${start[1]}&end_lat=${end[0]}&end_lon=${end[1]}`
    return request<RouteResponse>(`/route?${q}`)
  },

  getHazards(lat: number, lon: number, radiusM = 5000, limit = 60): Promise<Hazard[]> {
    return request<Hazard[]>(`/hazards?lat=${lat}&lon=${lon}&radius_m=${radiusM}&limit=${limit}`)
  },

  submitHazard(h: {
    type: string
    severity: string
    lat: number
    lon: number
    description: string
  }): Promise<Hazard> {
    return request<Hazard>('/hazards', { method: 'POST', body: JSON.stringify(h) })
  },

  getHospitals(lat: number, lon: number): Promise<Hospital[]> {
    return request<Hospital[]>(`/hospitals?lat=${lat}&lon=${lon}`)
  },

  activateEmergency(lat: number, lon: number, radiusKm?: number): Promise<EmergencyResponse> {
    return request<EmergencyResponse>('/emergency/activate', {
      method: 'POST',
      body: JSON.stringify({ lat, lon, radius_km: radiusKm }),
    })
  },

  getEmergencyRoute(
    start: [number, number],
    end: [number, number],
    hospitalId?: string,
  ): Promise<EmergencyRoute> {
    const q = `start_lat=${start[0]}&start_lon=${start[1]}&end_lat=${end[0]}&end_lon=${end[1]}`
    const h = hospitalId ? `&hospital_id=${encodeURIComponent(hospitalId)}` : ''
    return request<EmergencyRoute>(`/emergency/route?${q}${h}`)
  },

  createFatigueSession(thresholds?: Record<string, number>): Promise<FatigueState> {
    return request<FatigueState>('/fatigue/session', {
      method: 'POST',
      body: JSON.stringify({ driver_name: 'Demo Driver', thresholds }),
    })
  },

  fatigueEvent(event: {
    session_id: string
    event_type: string
    latency_seconds?: number
    response_duration?: number
    transcript?: string
    simulated?: boolean
  }): Promise<FatigueState> {
    return request<FatigueState>('/fatigue/event', {
      method: 'POST',
      body: JSON.stringify(event),
    })
  },

  fatigueChat(opts: {
    intent: 'question' | 'reply' | 'freeform'
    session_id?: string
    messages: { role: string; content: string }[]
  }): Promise<{ reply: string; source: 'ai' | 'scripted' }> {
    return request('/fatigue/chat', { method: 'POST', body: JSON.stringify(opts) })
  },

  getConfig(): Promise<{
    safety_weights: Record<string, number>
    providers: Record<string, string>
    api_keys_configured: string[]
  }> {
    return request('/config')
  },
}
