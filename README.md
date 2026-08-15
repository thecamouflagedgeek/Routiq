# 🛡️ RoadSafe AI — Intelligent Road Safety & Mobility Platform

An AI-powered mobility application combining high-end **Uber-inspired UI design** with real-time road risk scoring, conversational fatigue detection, and automated emergency response.

---

## 🌟 Key Features

1. **Uber-Inspired Design System**: Clean light vector map canvas, rounded floating header navigation (`Ride`, `Drive`, `Emergency`, `More`), and floating bottom ride statistics cards (`DISTANCE`, `CHARGES`, `SAFETY SCORE`, `BOOK NOW`).
2. **Mumbai Geocoding Autocomplete**: Real location search biased to Mumbai, Maharashtra, India (`Malad`, `Bandra`, `Andheri`, `Borivali`, `Dadar`, `Goregaon`, `Kandivali`, etc.) powered by OSM Nominatim & Photon services with graceful fallbacks.
3. **Real Road Routing & Live Status Badges**: Live road routes from TomTom / OSRM routing providers with explicit `LIVE ROUTE` and `DEMO ROUTE` status indicators.
4. **Deterministic Segment-Level Safety Engine**: Divides routes into ~750m segments and calculates weighted safety scores (0–100) based on Hazards (30%), Lighting (20%), Accidents (25%), Road Surface (15%), and Traffic (10%). Segments dynamically change color on Leaflet maps (`Green` = SAFE, `Yellow` = MODERATE, `Orange` = HIGH, `Red` = CRITICAL) with clickable risk factor breakdown drawers.
5. **Sleep Drive Conversational Engagement Engine**: A closed-loop, event-driven driver-awareness system. It learns the driver's **personal response baseline** (rolling latency median), temporally aggregates interaction signals (latency, silence, speech confidence) into an explainable state — `NORMAL → ATTENTION → ELEVATED → HIGH_CONCERN` — with **risk kept separate from confidence**, audio failures never counted as fatigue, cooldown-paced escalation like a considerate passenger, a deterministic **demo sequence**, and a clean driver-state API for the Dashboard's contextual-risk fusion widget.

   **Bidirectional & multilingual**: a `ConversationManager` (frontend `services/conversation/`) owns turn-taking, **barge-in** (the driver can interrupt Routiq mid-sentence), music permission (never auto-plays), language preference + mid-session switching, and quiet monitoring. **Groq** (`llama-3.3-70b-versatile`, backend-only key) provides conversational reasoning + semantic intent; deterministic safety rules in `app/services/intent.py` always override it (`EMERGENCY > FATIGUE > ROUTE > SAFETY > MUSIC > LANGUAGE > GENERAL`) and the LLM can only *propose* actions the app permits. **Sarvam** powers STT (Saaras v3) and natural Indian-voice TTS (Bulbul v3, cached) across 10 Indian languages + Indian English, including code-mixed speech — with browser fallbacks throughout. Live voice runs through an `AudioTransport` abstraction (browser mic today, car Bluetooth later).
6. **One-Tap Emergency SOS Response**: Simulated crash detection with a 60-second confirmation countdown, GPS position, top 6 nearest hospitals ranked by actual driving ETA, location sharing, and emergency dial buttons.

---

## 🚀 How to Run the Project

### Prerequisites
- **Node.js** (v18 or higher)
- **Python** (v3.9 or higher)
- **npm** or **yarn**

---

### 1. Backend Setup (FastAPI)

Navigate to the `backend` directory:

```bash
cd backend
```

Install Python dependencies:

```bash
pip install -r requirements.txt
```

Create a `.env` file (optional for API keys like Gemini, TomTom, OpenWeather):

```env
ROUTING_API_KEY=
TRAFFIC_API_KEY=
WEATHER_API_KEY=
AI_API_KEY=
```

Start the backend server:

```bash
uvicorn app.main:app --reload --port 8000
```

The API will run at `http://localhost:8000`. You can test API endpoints at `http://localhost:8000/docs`.

---

### 2. Frontend Setup (React + Vite + TypeScript)

In a new terminal, navigate to the `frontend` directory:

```bash
cd frontend
```

Install frontend dependencies:

```bash
npm install
```

Start the Vite development server:

```bash
npm run dev
```

Open `http://localhost:5173` in your browser.

---

## 🧪 Verified 22-Step Test Flow

Follow this step-by-step flow to test all features:

1. **Search Pickup Location**: Type `"Malad"` in the pickup input.
2. **Verify Results**: Mumbai locations appear (`Malad West, Mumbai, Maharashtra, India`).
3. **Select Pickup**: Click `Malad West`.
4. **Select Destination**: Type and select `"Bandra West"` or `"Santa Monica"`.
5. **Real Route Rendered**: The real street route appears on the light map canvas.
6. **Route Segmentation**: Route is split into distinct ~750m road segments.
7. **Deterministic Safety Scores**: Each segment receives a deterministic 0–100 safety score.
8. **Multi-Color Polylines**: Segments visibly display colors: Green (`SAFE`), Yellow (`MODERATE`), Orange (`HIGH`), Red (`CRITICAL`).
9. **Inspect Risky Segment**: Click on any orange or red route segment.
10. **Factor Breakdown Panel**: View the breakdown drawer showing exact Hazard, Lighting, Accident, Road Quality, and Traffic scores.
11. **Start Sleep Drive**: Click `Drive` in the top navbar and press **Start Sleep Drive**.
12. **Assistant Prompt**: The assistant asks a voice/text check-in question.
13. **Speak/Type Response**: Answer the question.
14. **Latency Measurement**: View measured response latency in seconds (`NORMAL` ≤ 2.0s).
15. **Simulate Delay**: Delay your response or click **Reply after 6s delay**.
16. **Fatigue Escalation**: Observe the state escalate (`NORMAL` → `CAUTION` → `ESCALATE`).
17. **Simulate Collision**: Navigate to `Emergency` tab and click **SIMULATE CRASH**.
18. **Confirmation Modal**: Potential collision modal opens with a 60-second confirmation timer.
19. **Activate Response**: Tap **Activate Emergency Response**.
20. **Hospital Discovery**: GPS location identifies surrounding hospitals.
21. **Driving ETA Ranking**: Top 6 hospitals rank by actual road driving ETA (e.g. `12 min`).
22. **One-Tap Actions**: Test **Call Emergency** and **Share Location** buttons.

---

## 🛠️ Tech Stack Overview

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS v4, Leaflet, React-Leaflet v5, Lucide Icons, Web Speech API.
- **Backend**: Python, FastAPI, Uvicorn, Pydantic, HTTPX, OSRM / TomTom Routing, OpenWeather, Gemini 2.0 Flash AI.
