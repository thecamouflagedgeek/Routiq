# ⚡ RoadSafe AI — Backend Breakdown & Timings

A concise architectural overview of the FastAPI backend for **RoadSafe AI**, detailing service modules, API endpoints, timeout thresholds, and latency benchmarks.

---

## 🏗️ Core Architecture & Endpoints

| Endpoint | Method | Description | Primary Engine / Provider |
| :--- | :--- | :--- | :--- |
| `/api/health` | `GET` | System health check | Lightweight status ping |
| `/api/config` | `GET` / `POST` | Inspect & runtime-override safety weights | Dynamic weight validator |
| `/api/route` | `GET` | Route calculation + per-segment safety scoring | OSRM / TomTom + SafetyEngine |
| `/api/safety-score` | `POST` | Custom polyline risk scoring | SafetyEngine |
| `/api/hazards` | `GET` / `POST` | Spatial hazard lookup & user hazard reporting | Spatial HazardStore |
| `/api/hospitals` | `GET` | Nearest hospitals ranked by live road ETA | Haversine + OSRM Matrix |
| `/api/fatigue/session` | `POST` | Init Sleep Drive monitoring session | FatigueEngine |
| `/api/fatigue/event` | `POST` | Ingest voice latency events & update fatigue level | FatigueEngine |
| `/api/fatigue/chat` | `POST` | AI fatigue check-in conversation | Gemini 2.0 Flash / Scripted AI |
| `/api/emergency/activate` | `POST` | Trigger SOS mode, ranked hospitals & 60s countdown | Emergency Dispatch Engine |

---

## ⏱️ Performance Benchmarks & Timeouts

| Component / Provider | Primary Provider | Fallback Provider | Target Timeout / Latency |
| :--- | :--- | :--- | :--- |
| **Routing Engine** | TomTom / OSRM | Deterministic Bezier Generator | `3.0s` timeout (`< 5ms` fallback) |
| **Traffic Data** | TomTom Live Traffic | Spatial Speed Matrix | `4.0s` timeout (`< 2ms` fallback) |
| **Weather Data** | OpenWeather API | Location-Seeded Demo Weather | `3.0s` timeout (`< 1ms` fallback) |
| **AI Conversation** | Gemini 2.0 Flash | Scripted Conversational Assistant | `5.0s` timeout (`< 2ms` fallback) |
| **Hospital Road ETA** | Live OSRM Route Matrix | Geodesic Haversine Formula | `2.5s` timeout (`< 3ms` fallback) |

---

## 🧠 Safety Scoring Weights (0–100 Scale)

The `SafetyEngine` calculates a 0-100 safety score per route segment based on 5 weighted parameters:

- ⚠️ **Hazards Weight**: `30%` (Potholes, debris, unlit roads, accidents)
- 💡 **Lighting Weight**: `20%` (Time of day + ambient light index)
- 🚗 **Accident History**: `25%` (Historical risk density)
- 🛣️ **Road Quality**: `15%` (Surface type & grade)
- 🚦 **Traffic Flow**: `10%` (Speed ratio vs free-flow speed)

### Risk Tier Thresholds
- 🟢 **SAFE**: `80 – 100` (Color: `#22c55e`)
- 🟡 **MODERATE**: `60 – 79` (Color: `#facc15`)
- 🟠 **HIGH**: `45 – 59` (Color: `#f97316`)
- 🔴 **CRITICAL**: `0 – 44` (Color: `#ef4444`)

---

## 💤 Sleep Drive Fatigue Latency Timings

The `FatigueEngine` monitors driver voice response latency (in seconds):

| Response Latency | Fatigue Status | Escalation Level | Action |
| :--- | :--- | :--- | :--- |
| **`0.0s – 2.0s`** | `NORMAL` | Level 0 | Normal monitoring |
| **`2.0s – 4.0s`** | `MILD` | Level 1 | Friendly check-in prompt |
| **`4.0s – 7.0s`** | `ELEVATED` | Level 2 | Audio warning alert |
| **`> 7.0s` or `2 Missed`** | `SEVERE / CRITICAL` | Level 3 | Loud alarm + Emergency countdown prompt |

---

## 🚨 Emergency Mode Timings

- **Emergency Countdown**: `60` seconds default before auto-dispatching SOS.
- **Search Radius**: `15 km` hospital query window.
- **Hospital Limit**: Ranks top `6` hospitals by real road driving ETA.
