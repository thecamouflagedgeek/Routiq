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
| `/api/fatigue/chat` | `POST` | **Bidirectional** conversation: driver-first turns, intent classification, road context | Groq (`llama-3.3-70b-versatile`) / scripted |
| `/api/fatigue/audio/transcribe` | `POST` | Speech-to-text via Sarvam **Saaras v3** (multipart audio) | Sarvam / browser STT fallback |
| `/api/fatigue/tts` | `POST` | Text-to-speech via Sarvam **Bulbul v3** (base64 audio, cached) | Sarvam / browser TTS fallback |
| `/api/emergency/activate` | `POST` | Trigger SOS mode, ranked hospitals & 60s countdown | Emergency Dispatch Engine |

---

## ⏱️ Performance Benchmarks & Timeouts

| Component / Provider | Primary Provider | Fallback Provider | Target Timeout / Latency |
| :--- | :--- | :--- | :--- |
| **Routing Engine** | TomTom / OSRM | Deterministic Bezier Generator | `3.0s` timeout (`< 5ms` fallback) |
| **Traffic Data** | TomTom Live Traffic | Spatial Speed Matrix | `4.0s` timeout (`< 2ms` fallback) |
| **Weather Data** | OpenWeather API | Location-Seeded Demo Weather | `3.0s` timeout (`< 1ms` fallback) |
| **AI Conversation** | Groq (`llama-3.3-70b-versatile`) | Scripted Conversational Assistant | `6.0s` timeout (`< 2ms` fallback) |
| **Sarvam STT** | Saaras v3 (`saaras:v3`) | Browser SpeechRecognition | `15.0s` timeout |
| **Sarvam TTS** | Bulbul v3 (`bulbul:v3`, voice `shubh`) | Browser SpeechSynthesis | `15.0s` timeout (cached phrases instant) |
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

## 💤 Sleep Drive — Conversational Driver-Engagement Engine

Sleep Drive is a **closed-loop, event-driven** system. The client streams audio
/conversation events to the backend; the backend owns the state machine:

```
SENSE (audio events) → UNDERSTAND (personal baseline) → PREDICT (temporal risk)
→ EXPLAIN (evidence) → ACT (escalation + cooldowns) → LEARN (baseline updates)
```

**Event taxonomy** (all consumed by the state engine, auditable per session):
`session_started`, `prompt_issued`, `speech_started`, `speech_ended`,
`response_received`, `driver_initiated`, `intent_detected`,
`language_detected`, `language_changed`, `ai_response_generated`,
`tts_started`/`tts_finished`/`tts_interrupted`,
`music_permission_requested`/`granted`/`denied`, `music_started`/`stopped`,
`silence_timeout`, `microphone_error`, `audio_failure`, `asr_error`,
`intervention_triggered`, `state_changed`, `reset`.

**Bidirectional & multilingual** — the driver can speak first at any time:

- `POST /api/fatigue/chat` with `intent: driver_initiated` + `driver_text`
  classifies the utterance (deterministic safety rules in `intent.py`
  override Groq; EMERGENCY > FATIGUE > ROUTE > SAFETY > MUSIC > LANGUAGE >
  GENERAL), attaches driver-state + road context, and returns `{reply,
  source, intent, language, action}`.
- The LLM **proposes** an intent/action; the app **decides** whether it is
  permitted (`_action_for`) — the LLM can never trigger music, an emergency
  call, a route change or a fatigue-state change directly.
- **Language switching is mid-session**: "switch to Hindi" updates the
  session language and replies in the new language — no restart. `auto` lets
  Saaras v3 detect the driver's language per utterance. Code-mixed input
  (e.g. "yaar, main thak gaya hoon") is preserved.
- **Security**: `GROQ_API_KEY` / `SARVAM_API_KEY` exist only in backend env
  config. `/api/config` reports only key NAMES that are configured; logs and
  error surfaces are redacted (`groq.py` `_redacted`), and the keys never
  appear in responses, frontend bundles, or git (`.env` is gitignored).

| Driver state | Risk band (temporal estimate) | Typical trigger |
| :--- | :--- | :--- |
| `NORMAL` | risk < 0.18 | responses close to the driver's personal baseline |
| `ATTENTION` | 0.18 – 0.32 | one or more responses noticeably slower than baseline |
| `ELEVATED` | 0.32 – 0.50 | repeated delays / reduced engagement |
| `HIGH_CONCERN` | ≥ 0.50 or prolonged silence | repeated severe delays or unexplained non-response |

**Key invariants**
- **Personal baseline**: latency is judged against the driver's own rolling
  median, not a universal threshold. Baseline only updates from responses
  close to the driver's usual pace (a degrading driver's "normal" never drifts
  upward). Insufficient baseline ⇒ conservative estimates.
- **Temporal, not one-shot**: risk is an exponentially-decaying accumulator
  with hysteresis (asymmetric attack/release + one-level-per-interaction
  de-escalation) so state never flaps `LOW → HIGH → LOW`.
- **Risk ≠ confidence**: `fatigue_risk` and `confidence` are separate fields.
  High risk with low confidence (few samples, bad mic) is a real state.
- **Fail-safe**: microphone / ASR / audio failures NEVER raise risk. Only
  genuine unexplained non-response (healthy mic + `silence_timeout`) counts;
  a first silence on a fresh session caps at `ELEVATED`.
- **Risk-adaptive pacing**: healthy drivers get long, slightly randomized
  quiet periods (60–120s) before the next check-in; intervals shorten as risk
  rises (`35s` ATTENTION, `20s` ELEVATED, `30s` HIGH_CONCERN). A healthy
  interaction ends with a brief human acknowledgement, then genuine QUIET
  MONITORING — the passenger stays silent. Prompt interval is never conflated
  with response latency.

**Endpoints**: `POST /api/fatigue/session` (mode `live`/`demo` + language),
`POST /api/fatigue/event`, `GET /api/fatigue/state/{id}` (clean driver-state
for Dashboard / Risk Fusion), `GET /api/fatigue/session/{id}/events` (audit
log), `POST /api/fatigue/chat` (Groq or scripted, bidirectional),
`POST /api/fatigue/audio/transcribe` (Sarvam Saaras v3),
`POST /api/fatigue/tts` (Sarvam Bulbul v3, cached).

---

## 🚨 Emergency Mode Timings

- **Emergency Countdown**: `60` seconds default before auto-dispatching SOS.
- **Search Radius**: `15 km` hospital query window.
- **Hospital Limit**: Ranks top `6` hospitals by real road driving ETA.
