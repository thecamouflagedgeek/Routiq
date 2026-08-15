import L from 'leaflet'
import { useEffect, useMemo } from 'react'
import { MapContainer, Marker, Polyline, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import { Crosshair, Maximize2, Minimize2, Siren } from 'lucide-react'
import { DEFAULT_MAP_CENTER, DEFAULT_ZOOM } from '../../config'
import type { EmergencyRoute, Hazard, Hospital, RouteResponse, Segment } from '../../types'
import { endIcon, HospitalMarker, startIcon, userLocationIcon } from './Markers'

interface MapViewProps {
  route?: RouteResponse | null
  hazards?: Hazard[] | null
  hospitals?: Hospital[] | null
  showHospitals?: boolean
  userLocation?: { lat: number; lon: number } | null
  selectedSegment?: Segment | null
  onSelectSegment?: (segment: Segment | null) => void
  hazardPickMode?: boolean
  onPickLocation?: (lat: number, lon: number) => void
  center?: [number, number]
  zoom?: number
  onReady?: (map: L.Map) => void
  onFullscreen?: () => void
  isFullscreen?: boolean
  startLabel?: string
  endLabel?: string
  /** Dynamic emergency navigation route (OSRM geometry + steps). */
  emergencyRoute?: EmergencyRoute | null
  emergencyDestinationName?: string
}

function RouteLayer({
  route,
  selected,
  onSelect,
}: {
  route: RouteResponse
  selected?: Segment | null
  onSelect?: (s: Segment | null) => void
}) {
  const casing = useMemo(
    () => route.geometry.map((p) => [p[0], p[1]] as [number, number]),
    [route],
  )
  return (
    <>
      <Polyline positions={casing} pathOptions={{ color: '#ffffff', weight: 9, opacity: 0.95 }} />
      {route.segments.map((seg) => {
        const isSelected = selected?.id === seg.id
        return (
          <Polyline
            key={seg.id}
            positions={seg.geometry.map((p) => [p[0], p[1]] as [number, number])}
            pathOptions={{
              color: seg.risk_color,
              weight: isSelected ? 8 : 5.5,
              opacity: isSelected ? 1 : 0.95,
              lineCap: 'round',
              lineJoin: 'round',
            }}
            eventHandlers={{
              click: () => onSelect?.(seg),
            }}
          />
        )
      })}
    </>
  )
}

function FlyToBounds({ bounds }: { bounds: L.LatLngBounds | null }) {
  const map = useMap()
  useEffect(() => {
    if (bounds) map.fitBounds(bounds, { padding: [70, 90] })
  }, [map, bounds])
  return null
}

function MapEvents({
  hazardPickMode,
  onPick,
}: {
  hazardPickMode: boolean
  onPick?: (lat: number, lon: number) => void
}) {
  useMapEvents({
    click(e) {
      if (hazardPickMode && onPick) onPick(e.latlng.lat, e.latlng.lng)
    },
  })
  return null
}

function EmergencyRouteLayer({
  route,
  destinationName,
}: {
  route: EmergencyRoute
  destinationName?: string
}) {
  return (
    <>
      <Polyline
        positions={route.geometry}
        pathOptions={{ color: '#ffffff', weight: 10, opacity: 0.95 }}
      />
      <Polyline
        positions={route.geometry}
        pathOptions={{
          color: '#dc2626',
          weight: 6,
          opacity: 0.95,
          lineCap: 'round',
          lineJoin: 'round',
        }}
      />
      <Marker position={route.start} icon={startIcon('Current location')} />
      <Marker position={route.end} icon={endIcon(destinationName ?? 'Hospital')} />
    </>
  )
}

function MapControls({
  onFullscreen,
  isFullscreen,
}: {
  onFullscreen: () => void
  isFullscreen: boolean
}) {
  const map = useMap()
  return (
    <div className="absolute bottom-24 right-3 z-[1000] flex flex-col gap-2 sm:bottom-4">
      <button
        className="map-btn"
        title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen map'}
        onClick={onFullscreen}
      >
        {isFullscreen ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
      </button>
      <button
        className="map-btn"
        title="Find my location"
        onClick={() => map.locate({ setView: true, maxZoom: 15 })}
      >
        <Crosshair size={17} />
      </button>
    </div>
  )
}

export function MapView({
  route,
  hospitals,
  showHospitals = false,
  userLocation,
  selectedSegment,
  onSelectSegment,
  hazardPickMode = false,
  onPickLocation,
  center = DEFAULT_MAP_CENTER,
  zoom = DEFAULT_ZOOM,
  onReady,
  onFullscreen,
  isFullscreen = false,
  startLabel,
  endLabel,
  emergencyRoute,
  emergencyDestinationName,
}: MapViewProps) {
  const bounds = useMemo(() => {
    const geo = emergencyRoute?.geometry ?? route?.geometry ?? null
    if (!geo || geo.length < 2) return null
    const pts = geo.map((p) => [p[0], p[1]] as [number, number])
    return L.latLngBounds(pts)
  }, [route, emergencyRoute])

  return (
    <>
    <MapContainer
      center={center}
      zoom={zoom}
      zoomControl
      className="h-full w-full"
      ref={(map) => {
        if (map) onReady?.(map)
      }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
      />

      {route && (
        <>
          <RouteLayer route={route} selected={selectedSegment} onSelect={onSelectSegment} />
          <Marker position={[route.start[0], route.start[1]]} icon={startIcon(startLabel ?? 'Start')} />
          <Marker position={[route.end[0], route.end[1]]} icon={endIcon(endLabel ?? 'Destination')} />
        </>
      )}

      {userLocation && (
        <Marker position={[userLocation.lat, userLocation.lon]} icon={userLocationIcon()} />
      )}

      {emergencyRoute && (
        <EmergencyRouteLayer route={emergencyRoute} destinationName={emergencyDestinationName} />
      )}

      {showHospitals && hospitals?.map((h) => <HospitalMarker key={h.id} hospital={h} />)}

      <FlyToBounds bounds={bounds} />
      <MapEvents hazardPickMode={hazardPickMode} onPick={onPickLocation} />
      {onFullscreen && <MapControls onFullscreen={onFullscreen} isFullscreen={isFullscreen} />}
    </MapContainer>

    {emergencyRoute && (
      <div className="pointer-events-none absolute left-3 top-3 z-[1000] flex items-center gap-2 rounded-xl bg-red-600 px-3 py-2 text-xs font-extrabold tracking-wider text-white shadow-lg">
        <Siren size={13} /> EMERGENCY ROUTE ACTIVE
      </div>
    )}
    </>
  )
}
