# 🛡️ RoadSafe AI

### Predict risk. Prevent accidents. Respond faster.

**RoadSafe AI** is an AI-powered road safety and mobility platform that combines **road-risk intelligence, conversational driver fatigue detection, and emergency response** into one system.

Instead of simply helping drivers get from A to B, RoadSafe asks a more important question:

> **"How safe is the journey — and what should we do when something goes wrong?"**

---

## 🚀 What RoadSafe Does

### 🗺️ 1. Explainable Safety Routing

RoadSafe doesn't treat a route as one flat score.

It analyzes the route **segment by segment**, combining available road-risk information to produce a **0–100 Safety Score**.

Routes are visualized using:

**🟢 Safe → 🟡 Moderate → 🟠 High → 🔴 Critical**

Click a risky segment to understand **why** it is risky instead of receiving an unexplained number.

For Mumbai, RoadSafe can incorporate supplied datasets covering:

- High-risk corridors
- High-risk junctions / blackspots
- Predicted hidden blackspots

This allows the system to explain:

> **Why is this road risky?**

rather than simply saying:

> **This road is risky.**

---

### 💤 2. Sleep Drive — Conversational Fatigue Detection

The core USP of RoadSafe is **Sleep Drive**.

> **"Every drowsiness system watches your eyes. Ours talks to you."**

Instead of relying only on camera-based eye detection, RoadSafe uses a conversational loop.

The assistant periodically interacts with the driver and observes:

- Response latency
- Missed responses
- Speech/interaction signals
- Deviation from the driver's normal response baseline

The system maintains an explainable fatigue state:

```text
NORMAL
   ↓
ATTENTION
   ↓
ELEVATED
   ↓
HIGH CONCERN
```

Warnings escalate progressively rather than triggering an alarm after a single slow response.

### Conversational intelligence

Sleep Drive combines:

- **Groq** — conversational reasoning and intent classification
- **Sarvam Saaras v3** — speech-to-text
- **Sarvam Bulbul v3** — Indian-language text-to-speech
- **Web Speech API** — browser fallback
- **LiveKit** — real-time voice transport architecture

The conversation layer and fatigue engine are intentionally separated:

```text
Conversation
     ↓
Speech / Response
     ↓
Response Latency
     ↓
Fatigue Engine
     ↓
Risk State
     ↓
Progressive Action
```

The AI can propose conversational actions, but deterministic safety rules remain in control.

---

### 🚨 3. Emergency Response

When an emergency is triggered, RoadSafe uses the driver's **real current location** to initiate an emergency workflow.

The system can:

1. Obtain the driver's GPS position
2. Discover real nearby hospitals dynamically
3. Rank hospitals using road travel time
4. Select the fastest reachable option
5. Display the route on the existing map
6. Provide navigation information
7. Share the user's location
8. Provide emergency calling actions

Hospitals are **not hardcoded**.

The emergency architecture is designed around:

```text
REAL GPS
   ↓
Hospital Discovery
   ↓
Road ETA
   ↓
Best Hospital
   ↓
Navigation Route
```

A simulated crash mode is included so the entire emergency flow can be demonstrated safely during a hackathon.

---

# 🧠 How It Works

At a high level:

```text
                 REAL-WORLD DATA
                       ↓
              ┌─────────────────┐
              │   ROADSAFE AI   │
              │                 │
              │ Risk Engine     │
              │ Fatigue Engine  │
              │ Emergency Engine│
              └─────────────────┘
                       ↓
              SAFETY DECISIONS
                       ↓
        ┌──────────────┼──────────────┐
        ↓              ↓              ↓
   SAFETY MAP      SLEEP DRIVE     EMERGENCY
```

### Road Risk

```text
Road + Hazard + Traffic + Risk Data
                ↓
          Risk Fusion
                ↓
        Segment Safety Score
                ↓
        Explainable Map
```

### Driver Fatigue

```text
Driver Voice
     ↓
Conversation
     ↓
Response Latency
     ↓
Personal Baseline
     ↓
Fatigue State
     ↓
Progressive Escalation
```

### Emergency

```text
Emergency Event
      ↓
Current GPS
      ↓
Nearby Hospitals
      ↓
Driving ETA
      ↓
Fastest Reachable Hospital
      ↓
Navigation + SOS Actions
```

---

# ✨ Key Features

| Feature | What it does |
|---|---|
| **Safety Score** | Rates route segments from 0–100 |
| **Risk Map** | Displays risk visually from green to red |
| **Risk Explainability** | Shows why a segment received its score |
| **Mumbai Risk Intelligence** | Uses high-risk corridor and blackspot datasets |
| **Sleep Drive** | Detects possible fatigue through conversation |
| **Personal Baseline** | Adapts to the driver's normal response behavior |
| **Multilingual Voice** | Supports Indian languages and English |
| **Emergency SOS** | Activates emergency workflow |
| **Dynamic Hospitals** | Finds real hospitals around the user |
| **Road ETA Ranking** | Prioritizes hospitals by driving time |
| **Navigation** | Displays the emergency route on the map |
| **Location Sharing** | Shares current emergency location |
| **Demo Mode** | Allows judges to experience the complete flow |

---

# 🛠️ Technology Stack

### Frontend

- React 19
- TypeScript
- Vite
- Tailwind CSS
- Leaflet
- React-Leaflet
- Lucide Icons
- Web Speech API

### Backend

- Python
- FastAPI
- Uvicorn
- Pydantic
- HTTPX

### AI & Voice

- Groq
- Sarvam Saaras v3
- Sarvam Bulbul v3
- Gemini — optional/legacy fallback
- ElevenLabs — optional
- LiveKit

### Maps & Routing

- OpenStreetMap
- React-Leaflet
- OSRM
- TomTom
- Geoapify
- Overpass where applicable

### Data

- Mumbai High-Risk Corridors
- Mumbai Blackspot / High-Risk Junction data
- Mumbai Predicted Hidden Blackspots

---

# 📁 Project Structure

```text
Routiq/
├── frontend/
│   ├── src/
│   ├── public/
│   ├── package.json
│   └── ...
│
├── backend/
│   ├── app/
│   │   ├── services/
│   │   ├── providers/
│   │   ├── data/
│   │   └── main.py
│   ├── requirements.txt
│   └── .env.example
│
└── README.md
```

---

# ⚙️ Getting Started

## Prerequisites

- Node.js 18+
- Python 3.13 recommended
- npm

---

## 1. Clone the repository

```bash
git clone https://github.com/Deon-codes/Routiq.git
cd Routiq
```

Switch to the project branch if required:

```bash
git checkout sleep-drive
```

---

## 2. Backend Setup

```bash
cd backend
```

Create a virtual environment:

### Windows

```powershell
python -m venv venv
venv\Scripts\activate
```

### macOS / Linux

```bash
python3 -m venv venv
source venv/bin/activate
```

Install dependencies:

```bash
pip install -r requirements.txt
```

Create:

```text
backend/.env
```

Use `.env.example` as the template.

Start FastAPI:

```bash
uvicorn app.main:app --reload --port 8000
```

API:

```text
http://localhost:8000
```

Swagger:

```text
http://localhost:8000/docs
```

---

## 3. Frontend Setup

Open a second terminal:

```bash
cd frontend
```

Install dependencies:

```bash
npm install
```

Create:

```text
frontend/.env
```

For local development:

```env
VITE_API_URL=http://localhost:8000
```

Start the frontend:

```bash
npm run dev
```

Open:

```text
http://localhost:5173
```

---

# 🔐 Environment Variables

Do not commit real API keys.

### Frontend

```env
VITE_API_URL=http://localhost:8000
```

For production:

```env
VITE_API_URL=https://routiq-o2j2.onrender.com
```

### Backend

Use `.env.example` to configure providers such as:

```env
ROUTING_API_KEY=
TRAFFIC_API_KEY=
WEATHER_API_KEY=
GROQ_API_KEY=
GEOAPIFY_API_KEY=
SARVAM_API_KEY=
LIVEKIT_URL=
LIVEKIT_API_KEY=
LIVEKIT_API_SECRET=
```

Optional providers should not prevent the application from starting unless the specific feature requires them.

---

# ☁️ Deployment

### Backend

The FastAPI backend is deployed as a Render Web Service.

Production start command:

```bash
uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

Current backend:

```text
https://routiq-o2j2.onrender.com
```

### Frontend

The React/Vite frontend can be deployed to Vercel.

Production environment variable:

```env
VITE_API_URL=https://routiq-o2j2.onrender.com
```

The frontend communicates with the deployed FastAPI backend through the same REST API used during local development.

---

# 🧪 Demo Flow

The recommended hackathon demonstration is:

### 1. Safety Routing

```text
Enter:
Malad → Bandra
```

RoadSafe:

- Finds the actual route
- Segments the route
- Calculates safety
- Colors the route
- Explains risky sections

### 2. Sleep Drive

Open **Drive**:

```text
Start Sleep Drive
        ↓
Assistant asks a question
        ↓
Driver responds
        ↓
Response latency measured
        ↓
Delayed responses demonstrated
        ↓
Fatigue state escalates
```

### 3. Emergency

Open **Emergency**:

```text
Simulate Crash
      ↓
60-second confirmation
      ↓
Activate Emergency
      ↓
Get current GPS
      ↓
Find real nearby hospitals
      ↓
Rank by driving ETA
      ↓
Select fastest reachable hospital
      ↓
Display route
```

---

# 🧭 Design Philosophy

RoadSafe is built around three principles:

### Predict

Identify road and driver risk before an accident occurs.

### Prevent

Use conversational engagement and safer route recommendations to reduce risk.

### Respond

When prevention isn't enough, provide immediate, actionable emergency assistance.

---

# 🏆 Why RoadSafe?

Most navigation systems optimize for:

> **Fastest route.**

Most driver-monitoring systems ask:

> **Are your eyes open?**

RoadSafe asks:

> **Is this route safe, is the driver okay, and what should happen next?**

That is the core idea behind RoadSafe AI.

---

## ⚠️ Disclaimer

RoadSafe AI is a **hackathon prototype**.

Safety scores, fatigue states, route ETAs, and emergency detection are estimates and should not be treated as guaranteed predictions, medical diagnoses, or guaranteed emergency-service dispatch.

Drivers should always prioritize safe driving and stop in a safe location when fatigued.

---

## 👥 Built For

**Road Safety Hackathon**

Built with AI, maps, real-time data, and human-centered safety design.
