import { useCallback, useEffect, useRef, useState } from 'react'

export interface GeoPosition {
  lat: number
  lon: number
}

export function useGeolocation() {
  const [position, setPosition] = useState<GeoPosition | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const watching = useRef(false)

  const getPosition = useCallback((): Promise<GeoPosition | null> => {
    return new Promise((resolve) => {
      if (!('geolocation' in navigator)) {
        setError('Geolocation not available in this browser.')
        resolve(null)
        return
      }
      setLoading(true)
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const p = { lat: pos.coords.latitude, lon: pos.coords.longitude }
          setPosition(p)
          setError(null)
          setLoading(false)
          resolve(p)
        },
        (err) => {
          setError(err.message || 'Location unavailable')
          setLoading(false)
          resolve(null)
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 },
      )
    })
  }, [])

  useEffect(() => {
    if (watching.current) return
    watching.current = true
    if (!('geolocation' in navigator)) {
      setError('Geolocation not available in this browser.')
      return
    }
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        setPosition({ lat: pos.coords.latitude, lon: pos.coords.longitude })
        setError(null)
      },
      (err) => {
        // Previously a silent no-op — errors (denied permission, timeout,
        // unavailable) now surface so the UI can react instead of just
        // showing a stuck "no GPS fix" with no explanation.
        setError(err.message || 'Location unavailable')
      },
      { enableHighAccuracy: true, maximumAge: 15000 },
    )
    return () => navigator.geolocation.clearWatch(id)
  }, [])

  return { position, error, loading, getPosition }
}