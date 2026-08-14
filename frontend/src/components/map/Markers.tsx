import L from 'leaflet'
import { Marker, Popup } from 'react-leaflet'
import { HAZARD_ICON_COLOR, SEVERITY_META } from '../../config'
import type { Hazard, Hospital } from '../../types'

// ---------------------------------------------------------------------------
// Icon builders
// ---------------------------------------------------------------------------

export function startIcon(name = 'Sutter Ave') {
  return L.divIcon({
    className: '',
    html: `
      <div class="pin-wrap">
        <span class="ripple"></span>
        <span class="ripple r2"></span>
        <div class="pin-core" style="background:#FF5A1F; border:3px solid #fff;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="#fff"><path d="M12 2L19 21L12 17L5 21L12 2Z"/></svg>
        </div>
        <div class="pin-label" style="position:absolute; bottom:-22px; left:50%; transform:translateX(-50%); font-size:11px; font-weight:800; color:#111; background:#fff; padding:1px 7px; border-radius:6px; box-shadow:0 2px 6px rgba(0,0,0,0.15); white-space:nowrap;">
          ${name}
        </div>
      </div>`,
    iconSize: [34, 42],
    iconAnchor: [17, 40],
    popupAnchor: [0, -36],
  })
}

export function endIcon(name = 'Rockaway Ave') {
  return L.divIcon({
    className: '',
    html: `
      <div class="dot-wrap">
        <span class="dot-ripple" style="border-color: rgba(255, 90, 31, 0.6);"></span>
        <span class="dot-core" style="background:#FF5A1F; border:3px solid #fff;"></span>
      </div>
      <div style="position:absolute; left:50%; top:-42px; transform:translateX(-50%); text-align:center;">
        <div class="dest-tag" style="background:#fff; border:1.5px solid #FF5A1F; color:#FF5A1F; font-size:9px; font-weight:800; tracking:0.1em; padding:2px 8px; border-radius:6px; box-shadow:0 3px 8px rgba(0,0,0,0.12);">DESTINATION</div>
        <div style="font-size:11px; font-weight:800; color:#111; background:#fff; padding:1px 6px; border-radius:5px; margin-top:2px; box-shadow:0 2px 6px rgba(0,0,0,0.1); white-space:nowrap;">${name}</div>
      </div>`,
    iconSize: [30, 60],
    iconAnchor: [15, 30],
    popupAnchor: [0, -30],
  })
}


export function hazardIcon(type: Hazard['type'], severity: Hazard['severity'], isUser: boolean) {
  const color = severity === 'high' ? SEVERITY_META.high.color : severity === 'medium' ? SEVERITY_META.medium.color : HAZARD_ICON_COLOR[type]
  return L.divIcon({
    className: '',
    html: `
      <div class="hazard-pin ${isUser ? 'user' : ''}" style="background:${color};">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"><path d="M12 7v6"/><circle cx="12" cy="17" r="1" fill="#fff" stroke="none"/></svg>
      </div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 26],
    popupAnchor: [0, -22],
  })
}

export function hospitalIcon() {
  return L.divIcon({
    className: '',
    html: `
      <div class="hospital-pin">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M9 4h6v6h6v4h-6v6H9v-6H3v-4h6z"/></svg>
      </div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 28],
    popupAnchor: [0, -26],
  })
}

export function userLocationIcon() {
  return L.divIcon({
    className: '',
    html: `
      <div style="position:relative;width:22px;height:22px;">
        <div style="position:absolute;inset:0;border-radius:50%;background:rgba(59,130,246,0.25);border:1px solid rgba(59,130,246,0.6);"></div>
        <div style="position:absolute;left:50%;top:50%;width:10px;height:10px;transform:translate(-50%,-50%);border-radius:50%;background:#3b82f6;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.3);"></div>
      </div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  })
}

// ---------------------------------------------------------------------------
// Marker components
// ---------------------------------------------------------------------------

export function HazardMarker({ hazard }: { hazard: Hazard }) {
  return (
    <Marker
      position={[hazard.lat, hazard.lon]}
      icon={hazardIcon(hazard.type, hazard.severity, hazard.source === 'user')}
    >
      <Popup>
        <div className="min-w-[150px]">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-bold text-neutral-900">{hazard.description}</span>
            {hazard.source === 'user' && (
              <span className="rounded bg-neutral-900 px-1.5 py-0.5 text-[9px] font-bold text-white">YOU</span>
            )}
          </div>
          <div className="mt-1 flex items-center gap-2 text-[11px] text-neutral-500">
            <span
              className="inline-block rounded-full px-2 py-0.5 font-semibold"
              style={{ backgroundColor: `${SEVERITY_META[hazard.severity].color}1a`, color: SEVERITY_META[hazard.severity].color }}
            >
              {SEVERITY_META[hazard.severity].label} severity
            </span>
            {hazard.distance_m != null && <span>{Math.round(hazard.distance_m)} m away</span>}
          </div>
        </div>
      </Popup>
    </Marker>
  )
}

export function HospitalMarker({ hospital }: { hospital: Hospital }) {
  return (
    <Marker position={[hospital.lat, hospital.lon]} icon={hospitalIcon()}>
      <Popup>
        <div className="min-w-[170px]">
          <div className="text-sm font-bold text-neutral-900">{hospital.name}</div>
          <div className="mt-1 text-[11px] text-neutral-500">
            ETA <span className="font-bold text-neutral-900">{hospital.eta_min} min</span> ·{' '}
            {hospital.distance_km} km
          </div>
          <div className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
            {hospital.eta_source === 'live' ? '● Live road ETA' : '○ Estimated ETA'}
          </div>
        </div>
      </Popup>
    </Marker>
  )
}
