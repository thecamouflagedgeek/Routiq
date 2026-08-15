import { API_BASE } from '../config'
import type {
  DriverState,
  EmergencyResponse,
  FatigueChatRequest,
  FatigueChatResponse,
  FatigueEventType,
  FatigueThresholds,
  GeocodeResult,
  Hazard,
  Hospital,
  LogEntry,
  RouteResponse,
  TranscribeResponse,
  TTSResponse,
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

  activateEmergency(lat: number, lon: number): Promise<EmergencyResponse> {
    return request<EmergencyResponse>('/emergency/activate', {
      method: 'POST',
      body: JSON.stringify({ lat, lon }),
    })
  },

  createFatigueSession(opts?: {
    mode?: 'live' | 'demo'
    thresholds?: Record<string, number> | FatigueThresholds
    language?: string
  }): Promise<DriverState> {
    return request<DriverState>('/fatigue/session', {
      method: 'POST',
      body: JSON.stringify({
        driver_name: 'Demo Driver',
        mode: opts?.mode ?? 'live',
        thresholds: opts?.thresholds,
        language: opts?.language ?? 'en-IN',
      }),
    })
  },

  fatigueEvent(event: {
    session_id: string
    event_type: FatigueEventType
    latency_ms?: number | null
    response_duration_ms?: number | null
    speech_confidence?: number | null
    speech_rate_wpm?: number | null
    transcript?: string | null
    prompt_id?: string | null
    error_code?: string | null
    simulated?: boolean
  }): Promise<DriverState> {
    return request<DriverState>('/fatigue/event', {
      method: 'POST',
      body: JSON.stringify(event),
    })
  },

  getFatigueState(sessionId: string): Promise<DriverState> {
    return request<DriverState>(`/fatigue/state/${sessionId}`)
  },

  getFatigueEvents(sessionId: string): Promise<{ session_id: string; events: LogEntry[] }> {
    return request(`/fatigue/session/${sessionId}/events`)
  },

  fatigueChat(opts: FatigueChatRequest): Promise<FatigueChatResponse> {
    return request<FatigueChatResponse>('/fatigue/chat', {
      method: 'POST',
      body: JSON.stringify(opts),
    })
  },

  /** Sarvam Saaras v3 STT — returns transcript + detected language, or
   *  source="error" so the caller falls back to browser speech. */
  fatigueTranscribe(blob: Blob, languageHint = 'auto'): Promise<TranscribeResponse> {
    const form = new FormData()
    form.append('file', blob, 'speech.wav')
    form.append('language_hint', languageHint)
    return fetch(`${API_BASE}/fatigue/audio/transcribe`, {
      method: 'POST',
      body: form,
    }).then(async (res) => {
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        throw new Error(`API ${res.status}: ${body.slice(0, 200)}`)
      }
      return res.json() as Promise<TranscribeResponse>
    })
  },

  /** Sarvam Bulbul v3 TTS — base64 audio, or source="browser" fallback. */
  fatigueTTS(text: string, language: string): Promise<TTSResponse> {
    return request<TTSResponse>('/fatigue/tts', {
      method: 'POST',
      body: JSON.stringify({ text, language }),
    })
  },

  getConfig(): Promise<{
    safety_weights: Record<string, number>
    providers: Record<string, string>
    api_keys_configured: string[]
  }> {
    return request('/config')
  },
}
