# RoadSafe AI — Quick Start Guide

## Prerequisites
- Python 3.8+ installed
- Node.js 16+ installed
- Backend `.env` file configured (see `backend/.env.example`)

---

## 1. Start the Backend (Python/FastAPI)

### Option A: Using the Batch File (Windows)
```cmd
START_BACKEND.bat
```

### Option B: Manual (any OS)
```bash
# Terminal 1: Backend
cd Routiq/backend

# Activate virtual environment
# Windows:
venv\Scripts\activate
# Mac/Linux:
source venv/bin/activate

# Start FastAPI server
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

**Backend will be running at:** `http://127.0.0.1:8000`

---

## 2. Start the Frontend (React/Vite)

```bash
# Terminal 2: Frontend
cd Routiq/frontend

# Start Vite dev server
npm run dev
```

**Frontend will be running at:** `http://localhost:5173`

---

## 3. Test Emergency Navigation Performance

1. Open `http://localhost:5173` in your browser
2. Navigate to the **Emergency** page
3. Click **"SIMULATE CRASH"**
4. **Time how long it takes** from click to seeing the hospital list

### Expected Results:
- ✅ **2-6 seconds** (first activation)
- ✅ **<4 seconds** (repeated activation in same area — cached)
- ✅ Progress indicators: "Finding location" → "Searching hospitals" → "Calculating route"
- ✅ Hospital list ranked by road ETA (fastest first)

### Previous Performance (Before Fix):
- ❌ 15-49 seconds
- ❌ No progress indicators
- ❌ Could hang indefinitely

---

## 4. Verify No Regressions

Test these features to ensure the performance fix didn't break anything:

### Dashboard / Ride Planning
1. Go to Dashboard page
2. Enter start and end locations
3. Click "Plan Route"
4. **Expected**: Route displays with safety score, segments colored by risk

### Safety Score
1. From Dashboard, select a route
2. View the overall safety score (0-100)
3. **Expected**: Score calculated correctly, segments shown on map

### Sleep Drive (if configured)
1. Go to Sleep Drive page
2. Start a conversation
3. **Expected**: AI responds, conversation flows normally

---

## Troubleshooting

### Backend Connection Refused
**Error**: `Error: connect ECONNREFUSED 127.0.0.1:8000`

**Solution**: Backend isn't running. Start it with:
```bash
cd Routiq/backend
venv\Scripts\activate  # Windows
uvicorn app.main:app --reload
```

### Virtual Environment Not Found
**Error**: `venv\Scripts\activate.bat not found`

**Solution**: Create virtual environment:
```bash
cd Routiq/backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
```

### Frontend Build Errors
**Error**: CSS @import warnings

**Solution**: Already fixed! The `@import` for Google Fonts has been moved to the top of `index.css`.

### OSRM Timeout / Slow
**Error**: Emergency activation takes >10 seconds

**Possible causes**:
1. Public OSRM server is overloaded (common during peak hours)
2. Network latency
3. Geographic location far from OSRM servers

**Solutions**:
1. Try again (transient issue)
2. Use a different network
3. Self-host OSRM (see `EMERGENCY_PERFORMANCE_FIX.md`)

### Overpass Timeout
**Error**: "Unable to retrieve nearby hospitals"

**Cause**: Public Overpass API is overloaded or your location has no hospitals nearby

**Solutions**:
1. System gracefully falls back to demo mode
2. Cache will help on repeated activations
3. Try a different location (e.g., Mumbai, London, New York)

---

## Performance Testing (Optional)

Run the automated performance test to see the actual speedup:

```bash
cd Routiq/backend
python test_emergency_performance.py
```

**Expected output**:
```
Old approach: 12-36s (12 separate requests)
New approach: 2-4s (1 batch request)
Speedup: 5-10x faster
✅ EXCELLENT: 5x+ speedup achieved!
```

---

## API Keys (Optional)

The app works without API keys (demo mode). To enable live features, add keys to `backend/.env`:

### Required for Full Features:
- `ROUTING_API_KEY` — TomTom routing (traffic-aware routes)
- `TRAFFIC_API_KEY` — TomTom traffic data
- `WEATHER_API_KEY` — OpenWeather real-time conditions
- `AI_API_KEY` — Gemini for AI analysis
- `GROQ_API_KEY` — Groq for Sleep Drive conversations
- `SARVAM_API_KEY` — Sarvam for Indian language STT/TTS
- `ELEVENLABS_API_KEY` — ElevenLabs for premium TTS

### Not Required:
- Emergency navigation works with public OSRM/Overpass (no keys needed)
- Dashboard works with demo routing
- Safety Score works with demo data

---

## Next Steps

1. ✅ Verify emergency navigation is fast (2-6 seconds)
2. ✅ Test other features (Dashboard, Safety Score)
3. ✅ Check backend logs for cache hits/misses
4. ✅ Monitor performance over time

If emergency navigation is still slow after testing, consider:
- Self-hosting OSRM for production deployment
- Using Geoapify/OpenRouteService/Mapbox as alternatives

See `EMERGENCY_PERFORMANCE_FIX.md` for detailed technical documentation.

---

## Support

If you encounter issues:
1. Check backend logs for errors
2. Check browser console for frontend errors
3. Verify `.env` file is configured
4. Ensure both backend and frontend are running
5. Review `EMERGENCY_PERFORMANCE_FIX.md` for technical details
