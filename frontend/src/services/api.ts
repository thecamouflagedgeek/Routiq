import { API_BASE } from '../config'
import type {
  DriverState,
  EmergencyResponse,
  EmergencyRoute,
  FatigueChatRequest,
  FatigueChatResponse,
  FatigueEventType,
  FatigueState,
  FatigueThresholds,
  GeocodeResult,
  Hazard,
  Hospital,
  LogEntry,
  RouteResponse,
  TranscribeResponse,
  TTSResponse,
} from '../types'

/**
 * Abort a fetch after `timeoutMs` so a hung backend can never wedge a
 * conversational turn or leave a promise dangling forever. Long-running
 * calls (TTS synthesis) get a larger budget than chat.
 */
async function request<T>(path: string, init?: RequestInit, timeoutMs = 20000): Promise<T> {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), timeoutMs)
  const signal = init?.signal ? init.signal : controller.signal
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...init,
      signal,
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`API ${res.status}: ${body.slice(0, 200)}`)
    }
    return res.json() as Promise<T>
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Request timed out. Please try again.')
    }
    throw error
  } finally {
    window.clearTimeout(timer)
  }
}

export const api = {
  geocode(query: string): Promise<GeocodeResult[]> {
    return request<GeocodeResult[]>(`/geocode?q=${encodeURIComponent(query)}`)
  },

  reverseGeocode(lat: number, lon: number): Promise<GeocodeResult> {
    return request<GeocodeResult>(`/reverse-geocode?lat=${lat}&lon=${lon}`)
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
    // Places and Matrix each honour the backend's 5s Geoapify timeout.
    return request<EmergencyResponse>(
      '/emergency/activate',
      {
        method: 'POST',
        body: JSON.stringify({ lat, lon, radius_km: radiusKm }),
      },
      15000,
    )
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

  /**
   * FIX: this previously took a single `thresholds` parameter but referenced
   * a nonexistent `opts` variable in its body — a ReferenceError thrown
   * synchronously (before any Promise was returned) every time this was
   * called as `createFatigueSession({ mode, thresholds, language })` from
   * ConversationManager.start(). Because the throw happened synchronously,
   * it was NOT caught by the `.catch()` chained onto the call site — it blew
   * straight up through start() as an uncaught exception, aborting session
   * creation entirely. `sessionId` was then never set, so every later
   * `/fatigue/event` call went out with an empty/invalid session_id, which
   * is what the backend's 422 was actually rejecting.
   */
  createFatigueSession(opts?: {
    mode?: 'live' | 'demo'
    thresholds?: Record<string, number> | Partial<FatigueThresholds>
    language?: string
  }): Promise<FatigueState> {
    return request<FatigueState>('/fatigue/session', {
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
    // Chat turns must resolve fast — 12s covers retries + backoff, never hangs.
    return request<FatigueChatResponse>(
      '/fatigue/chat',
      {
        method: 'POST',
        body: JSON.stringify(opts),
      },
      12000,
    )
  },

  /** Sarvam Saaras v3 STT — returns transcript + detected language, or
   *  source="error" so the caller falls back to browser speech. */
  async fatigueTranscribe(blob: Blob, languageHint = 'auto'): Promise<TranscribeResponse> {
    const form = new FormData()
    form.append('file', blob, 'speech.wav')
    form.append('language_hint', languageHint)
    const controller = new AbortController()
    const timer = window.setTimeout(() => controller.abort(), 20000)
    try {
      const res = await fetch(`${API_BASE}/fatigue/audio/transcribe`, {
        method: 'POST',
        body: form,
        signal: controller.signal,
      })
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        throw new Error(`API ${res.status}: ${body.slice(0, 200)}`)
      }
      const data = (await res.json()) as TranscribeResponse
      return {
        ...data,
        provider: data.provider ?? 'sarvam',
        fallback: Boolean(data.fallback),
      }
    } finally {
      window.clearTimeout(timer)
    }
  },

  /** Sarvam Bulbul v3 TTS — base64 audio, or source="browser" fallback. */
  fatigueTTS(text: string, language: string): Promise<TTSResponse> {
    // Synthesis is the slowest call in the loop (Sarvam render + retries).
    return request<TTSResponse>(
      '/fatigue/tts',
      {
        method: 'POST',
        body: JSON.stringify({ text, language }),
      },
      25000,
    ).then((data) => ({
      ...data,
      provider: data.provider ?? 'sarvam',
      fallback: Boolean(data.fallback),
    }))
  },

  getElevenLabsToken(): Promise<{ signed_url: string }> {
    return request('/elevenlabs/token')
  },

  getLiveKitToken(payload?: { identity?: string; room_name?: string }): Promise<{
    token: string
    room_name: string
    identity: string
    url: string
    provider: string
  }> {
    return request('/livekit/token', {
      method: 'POST',
      body: JSON.stringify(payload ?? {}),
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
