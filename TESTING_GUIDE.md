# Sleep Drive LiveKit Voice Agent Testing Guide

## Overview

This document outlines the full validation path for the migrated Sleep Drive voice architecture:

- **Transport**: Browser STT/TTS → **LiveKit persistent room** (fixed)
- **TTS Provider**: ElevenLabs → **Sarvam** (fixed)
- **Backend**: Token-only → **Full Agent Loop** (ready to implement)
- **Acceptance Criteria**: 10+ turn conversation without microphone restart

---

## Pre-Flight Checklist

### Backend Environment

Ensure `.env` is present with all required secrets:

```bash
cd backend
cp .env.example .env
```

Edit `.env` and fill in:

- `LIVEKIT_URL` — LiveKit server URL (e.g., `https://routiq.livekit.cloud`)
- `LIVEKIT_API_KEY` — LiveKit API key (from LiveKit dashboard)
- `LIVEKIT_API_SECRET` — LiveKit API secret (from LiveKit dashboard)
- `GROQ_API_KEY` — Groq API key (from Groq console)
- `SARVAM_API_KEY` — Sarvam API key (from Sarvam dashboard)
- `TTS_PROVIDER=sarvam` — **Must be "sarvam", not "elevenlabs"**
- `STT_PROVIDER=sarvam`

### Verify Configuration

Run a quick Python validation to ensure all keys are present:

```bash
cd backend
python3 -c "from app.config import settings; print('✓ Config loaded'); print(f'  LIVEKIT: {settings.has_livekit}'); print(f'  SARVAM: {settings.has_sarvam}'); print(f'  GROQ: {settings.has_groq}')"
```

Expected output:

```
✓ Config loaded
  LIVEKIT: True
  SARVAM: True
  GROQ: True
```

### Install Dependencies

```bash
cd backend
pip install -r requirements.txt

cd ../frontend
npm install
```

### Verify Builds

```bash
# Backend: should have 2 tests passing
cd backend
python -m pytest -q

# Frontend: should compile without TypeScript errors
cd frontend
npm run build
```

---

## Starting the Application

### Terminal 1: Backend Server

```bash
cd backend
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Expected output:

```
INFO:     Uvicorn running on http://0.0.0.0:8000
INFO:     Application startup complete
```

### Terminal 2: Frontend Dev Server

```bash
cd frontend
npm run dev
```

Expected output:

```
➜  Local:   http://localhost:5173/
➜  press h to show help
```

### Terminal 3: LiveKit Agent Worker (will be added in next phase)

Once the full LiveKit Agent implementation is complete:

```bash
cd backend
livekit-agents dev app.main:procs --host 0.0.0.0 --port 8081
```

---

## Browser Testing Protocol

### Setup

1. Open `http://localhost:5173/` in a modern browser (Chrome/Edge recommended for best WebRTC)
2. Navigate to **Sleep Drive** page
3. Grant microphone and speaker permissions
4. Verify in browser console that `AudioTransport('livekit')` is active
5. Note the current time for latency measurements

### Turn-by-Turn Test Script

**Goal**: Execute 10+ turns without the microphone dying or requiring manual restart.

#### TURN 1: Greeting

- **Driver says**: "Hey Routiq"
- **Expect**: Agent responds with a greeting (e.g., "Hi there! I'm here to help keep you safe on the road.")
- **Measure**: Latency from voice end to response start (target: <3s)
- **Evidence**: Screenshot of transcript showing exchange

#### TURN 2: Safety Information

- **Driver says**: "What's my safety score?"
- **Expect**: Agent responds with current fatigue score and brief explanation
  - Example: "Your safety score is 82 out of 100. You're in the green zone right now, but I'm watching for any signs of fatigue."
- **Measure**: Latency
- **Evidence**: Screenshot of fatigue state + transcript

#### TURN 3: Risk Details

- **Driver says**: "Why is that segment risky?"
- **Expect**: Agent explains a specific road segment hazard (e.g., "The upcoming 2km segment has weather hazards — light rain with reduced visibility. Plus there's moderate traffic congestion.")
- **Measure**: Latency
- **Evidence**: Screenshot showing Hazard segment in conversation

#### TURN 4: Route Assistance

- **Driver says**: "Can you find a safer route?"
- **Expect**: Agent offers an alternative route with risk comparison
  - Example: "I found a route 8km longer but 15% safer. It avoids the weather zone."
- **Measure**: Latency
- **Evidence**: Screenshot of route suggestion

#### TURN 5: Time Estimate

- **Driver says**: "How long will it take?"
- **Expect**: Agent provides ETA and time breakdown
  - Example: "That route will take about 45 minutes with current traffic."
- **Measure**: Latency
- **Evidence**: Screenshot

#### TURN 6: Fatigue Assessment

- **Driver says**: "How am I doing?"
- **Expect**: Agent provides personalized fatigue state
  - Example: "You're doing well. Your blink rate is normal, grip is steady. Keep it up for another hour before a break."
- **Measure**: Latency
- **Evidence**: Screenshot showing Fatigue engine output

#### TURN 7: Language Switch

- **Driver says**: "Switch to Hindi"
- **Expect**: Agent confirms language change (e.g., "ठीक है, मैं हिंदी में बोलूंगा।" / "Okay, I'll speak in Hindi now.")
- **Measure**: Latency
- **Note**: Verify language appears in transcript or UI language selector updates
- **Evidence**: Screenshot showing language change confirmation

#### TURN 8: Hindi Conversation

- **Driver says** (in Hindi): "मुझे थकान हो रही है" (I'm getting tired)
- **Expect**: Agent responds in Hindi with appropriate fatigue protocol
  - Example: "आपके संकेत दिख रहे हैं। आपको अगले 10 मिनट में आराम की जरूरत है।" (I can see signs. You need rest in the next 10 minutes.)
- **Measure**: Latency
- **Evidence**: Screenshot of Hindi response

#### TURN 9: Barge-In Test (Interruption)

- **Agent is speaking**: (Let agent speak for 3-5 seconds without interruption)
- **Driver interrupts**: "Wait, how far to the next exit?" (while agent is still speaking)
- **Expect**:
  - Agent immediately detects driver's voice via VAD
  - TTS playback is cut off (NOT queued)
  - Agent responds to the NEW question within <2s
  - NO audio overlap or cross-talk
- **Measure**: Time from driver's voice start to agent's response to new question
- **Evidence**: Video clip showing clean interruption, no overlap

#### TURN 10: Follow-up Question

- **Driver says**: "Is this route safe in the dark?"
- **Expect**: Agent responds with night-time risk assessment
  - Example: "Yes, this route is well-lit. Streetlights are good, and traffic is low at night."
- **Measure**: Latency
- **Evidence**: Screenshot

#### TURN 11: Microphone Persistence

- **Wait in silence**: 30 seconds (microphone still active, no sound)
- **Driver says**: "Are you still here?"
- **Expect**:
  - Microphone did NOT restart or disconnect
  - Agent responds immediately
  - No indication of reconnection in browser console
- **Measure**: Total silence duration before response
- **Evidence**: Screenshot showing timestamp before silence and response latency

#### TURN 12+ (Optional Extension)

- **Driver says**: "Tell me about the weather for the next 50km"
- **Expect**: Multi-segment response with weather hazards for each segment
- **Driver says**: "What's the traffic pattern?"
- **Expect**: Agent summarizes traffic across the route
- **Continue testing until satisfied that system is stable**

---

## Critical Validation Checkpoints

### Audio Quality

- [ ] Both STT and TTS audio are clear (no distortion, crackle, or dropout)
- [ ] Microphone levels are appropriate (not clipping, not too quiet)
- [ ] Speaker output is audible and synchronized with transcript

### Conversation Flow

- [ ] All 10+ turns complete without user intervention
- [ ] Microphone does NOT require manual restart between turns
- [ ] Agent's responses are contextually relevant (no nonsense or off-topic)
- [ ] Agent maintains conversation history (references earlier statements)

### Language Switching

- [ ] Hindi language selection persists across multiple turns
- [ ] No code-switching (agent doesn't revert to English mid-sentence)
- [ ] Hindi phoneme generation is clear and properly accented

### Barge-In Behavior

- [ ] Driver can interrupt while agent is speaking
- [ ] Interrupted speech is NOT played or queued after
- [ ] Agent's response to new input is immediate (<2s)
- [ ] No audio overlap or crosstalk in room recording

### Latency Measurements

Record actual latencies for each turn:

- TURN 1: **\_** ms
- TURN 2: **\_** ms
- TURN 3: **\_** ms
- TURN 4: **\_** ms
- TURN 5: **\_** ms
- TURN 6: **\_** ms
- TURN 7: **\_** ms
- TURN 8: **\_** ms
- TURN 9: **\_** ms (barge-in response)
- TURN 10: **\_** ms
- TURN 11: **\_** ms (post-silence response)

**Target**: All turns <3s; barge-in <2s

### Fatigue Engine Telemetry

- [ ] Fatigue engine receives events from agent via `/api/fatigue/event`
- [ ] Fatigue state updates correctly based on conversation length
- [ ] Risk band displays in SleepDrive UI (NORMAL → ATTENTION → ELEVATED → HIGH_CONCERN)
- [ ] Agent's recommendations align with current risk band

---

## Browser Console Diagnostics

Open the browser DevTools console (`F12` or `Ctrl+Shift+I`). Look for:

### Expected Logs

```javascript
// Transport initialization
[AudioTransport] Initializing livekit transport
[LiveKitTransport] Connecting to room...
[LiveKitTransport] Connected to room 'routiq-session-<uuid>'
[LiveKitTransport] Microphone published to room
[LiveKitTransport] Subscribed to agent audio track

// Per-turn events
[SleechStart] Agent speech detected
[SpeechEnd] Agent speech ended
[UserSpeech] Driver speech detected
```

### Red Flags (Do NOT ignore)

- ❌ `[ERROR] transport not initialized`
- ❌ `[ERROR] failed to connect to room`
- ❌ `[ERROR] microphone restart required`
- ❌ `[ERROR] audio track disconnected`
- ❌ `WebRTC ICE failure` or `connection state: disconnected`
- ❌ `TypeError: Cannot read property 'publish' of undefined` (indicates room connection failure)

If you see red flags, check:

1. Backend is running and `/api/livekit/token` returns a token
2. LiveKit URL and credentials in `.env` are correct
3. Frontend is using `createAudioTransport('livekit')` (should see in logs)
4. Browser has microphone permission

---

## Testing Evidence Capture

### Screenshots to Collect

1. **T1-T11**: Transcript showing all turns (File → Export Transcript or screenshot)
2. **Fatigue State**: UI showing risk band for each turn
3. **Hindi UI**: Language selector showing "हिंदी" after TURN 7
4. **Barge-In**: Video clip showing clean interruption (use browser recording)

### Log Files to Collect

```bash
# Backend logs (shows agent activity)
# Terminal 1 output

# Frontend logs (shows transport state)
# Browser DevTools console → right-click → Save As

# LiveKit logs (if available)
# Check LiveKit dashboard for room session details
```

### Success Criteria Summary

✓ All 10+ turns completed
✓ Microphone never restarted manually
✓ Barge-in worked (interruption + immediate response)
✓ Language switching worked (Hindi)
✓ Fatigue state updated in UI
✓ No console errors or WebRTC failures
✓ Average latency <3s per turn
✓ Barge-in response <2s

---

## Debugging Common Issues

### Issue: "Microphone disconnected after 1-2 turns"

**Cause**: LiveKit room connection dropped
**Fix**:

1. Check backend logs for connection errors
2. Verify `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` in `.env`
3. Confirm backend is running: `curl http://localhost:8000/docs`
4. Test token generation: `curl -X POST http://localhost:8000/api/livekit/token`

### Issue: "Agent not responding (timeout after 30s)"

**Cause**: LiveKit Agent worker not running OR entrypoint not registered
**Fix**:

1. Ensure livekit-agents is installed: `pip list | grep livekit`
2. Check if agent worker is running (Terminal 3)
3. Verify `app.services.livekit_agent` is imported in `main.py`
4. Check backend logs for agent initialization errors

### Issue: "VAD not detecting speech"

**Cause**: Silero VAD not initialized OR microphone not publishing
**Fix**:

1. Verify Silero VAD is installed: `pip list | grep silero`
2. Check browser microphone is active: DevTools → Sources → Web Workers
3. Test microphone in browser: go to chrome://settings/content/microphone and test

### Issue: "STT generating gibberish"

**Cause**: Sarvam API key incorrect OR language mismatch
**Fix**:

1. Verify `SARVAM_API_KEY` is set correctly
2. Test Sarvam STT directly:
   ```bash
   python3 << 'EOF'
   from app.services.sarvam import SarvamService
   sarvam = SarvamService(api_key="YOUR_KEY")
   result = sarvam.transcribe(audio_bytes, language="en")
   print(result)
   EOF
   ```
3. Ensure language code matches (en, hi, etc.)

### Issue: "TTS not playing"

**Cause**: Sarvam TTS not working OR audio playback permission denied
**Fix**:

1. Verify `SARVAM_API_KEY` is set
2. Check browser speaker permission: DevTools → Permissions
3. Test TTS directly:
   ```bash
   python3 << 'EOF'
   from app.services.sarvam import SarvamService
   sarvam = SarvamService(api_key="YOUR_KEY")
   audio = sarvam.synthesize("Hello world", language="en")
   # Should return audio bytes
   print(f"Generated {len(audio)} bytes of audio")
   EOF
   ```

### Issue: "Barge-in not working (agent finishes speech even after driver talks)"

**Cause**: VAD not running in agent loop OR TTS not being interrupted
**Fix**:

1. Ensure LiveKit Agent loop is running (check logs for "VAD initialized")
2. Verify Silero VAD plugin is active in agent
3. Check livekit_agent.py for TTS interruption handling
4. Test manually: speak clearly while agent is speaking

---

## Success Checklist

Before claiming the migration is complete:

- [ ] All environment variables are set in `.env`
- [ ] Backend server starts without errors
- [ ] Frontend dev server starts without errors
- [ ] Browser loads Sleep Drive page without crashes
- [ ] Microphone permission is granted
- [ ] Turn 1: Agent greets driver
- [ ] Turn 2-6: Multi-turn conversation works (fatigue/route/safety questions)
- [ ] Turn 7: Language switch to Hindi is confirmed
- [ ] Turn 8: Hindi conversation works
- [ ] Turn 9: Barge-in interruption works cleanly
- [ ] Turn 10-11: Post-interruption conversation continues
- [ ] Turn 12+: Extended conversation stability confirmed
- [ ] Microphone never restarted manually
- [ ] No console errors or WebRTC failures
- [ ] Average latency <3s per turn
- [ ] Barge-in latency <2s
- [ ] Fatigue engine UI updates with conversation state
- [ ] Hindi text displays correctly in transcript

---

## Next Phase: Validation & Optimization

Once all 11+ turns pass:

1. **Load Testing**: Can agent handle 5 simultaneous rooms?
2. **Latency Optimization**: What's the true end-to-end latency breakdown?
3. **Battery Impact**: How much does persistent WebRTC connection drain mobile battery?
4. **Fallback Testing**: What happens if Sarvam/Groq API is down?
5. **Cross-Browser**: Test on Safari, Firefox (for production deployment)
6. **Accessibility**: Can screenreader users interact with conversation transcript?

---

## Reference: Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (React)                          │
│  ┌──────────────────┐        ┌──────────────────┐              │
│  │   SleepDrive UI  │◄──────►│ useFatigue Hook  │              │
│  └────────┬─────────┘        └────────┬─────────┘              │
│           │                           │                         │
│  ┌────────▼──────────────────────────▼─┐                       │
│  │   AudioTransport (livekit)           │                       │
│  │  ┌─────────────────────────────────┐ │                       │
│  │  │  LiveKitTransport               │ │                       │
│  │  │  • Connect to room              │ │                       │
│  │  │  • Publish microphone           │ │                       │
│  │  │  • Subscribe to agent audio     │ │                       │
│  │  └─────────────────────────────────┘ │                       │
│  └────────┬──────────────────────────────┘                       │
│           │                                                      │
│  ┌────────▼──────────────────────────┐                          │
│  │  api.getLiveKitToken()             │                          │
│  │  POST /api/livekit/token           │                          │
│  └────────┬──────────────────────────┘                          │
└────────┼──────────────────────────────────────────────────────┘
         │
         ▼ HTTPS
    ┌────────────────────────────────────────────────────────────┐
    │         Backend (FastAPI)                                  │
    │  ┌──────────────────────────────────────────────────────┐  │
    │  │ /api/livekit/token Endpoint                          │  │
    │  │ • livekit_service.create_token(identity, room)       │  │
    │  │ • Returns JWT with VideoGrants                       │  │
    │  └──────────────────────────────────────────────────────┘  │
    │                                                             │
    │  ┌──────────────────────────────────────────────────────┐  │
    │  │ LiveKit Agent (livekit-agents framework)             │  │
    │  │  ┌────────────────────────────────────────────────┐  │  │
    │  │  │ entrypoint(ctx) — Main Agent Loop              │  │  │
    │  │  │  1. VAD (Silero) — wait for speech              │  │  │
    │  │  │  2. STT (Sarvam) — transcribe                   │  │  │
    │  │  │  3. LLM (Groq) — generate response              │  │  │
    │  │  │  4. TTS (Sarvam) — synthesize                   │  │  │
    │  │  │  5. Publish to room audio track                 │  │  │
    │  │  │  6. Emit telemetry → /api/fatigue/event         │  │  │
    │  │  │  7. Loop to step 1                              │  │  │
    │  │  └────────────────────────────────────────────────┘  │  │
    │  │                                                       │  │
    │  │ Services:                                            │  │
    │  │  • SarvamService (STT + TTS)                         │  │
    │  │  • GroqService (LLM reasoning)                       │  │
    │  │  • FatigueEngine (event consumption)                 │  │
    │  └──────────────────────────────────────────────────────┘  │
    │                                                             │
    │  ┌──────────────────────────────────────────────────────┐  │
    │  │ Config (app/config.py)                               │  │
    │  │  • LIVEKIT_* (url, api_key, api_secret)              │  │
    │  │  • SARVAM_API_KEY                                    │  │
    │  │  • GROQ_API_KEY                                      │  │
    │  │  • TTS_PROVIDER = "sarvam" (NOT "elevenlabs")        │  │
    │  │  • has_livekit, has_sarvam, has_groq properties      │  │
    │  └──────────────────────────────────────────────────────┘  │
    └────────────────────────────────────────────────────────────┘
         ▲                                ▲
         │ WebRTC                        │ HTTP
         │ (media tracks)                │ (events)
         ▼                                │
    ┌────────────────────────────────────┼──────────────────────┐
    │              LiveKit Server                                │
    │  ┌────────────────────────────────▼─────────────────────┐ │
    │  │ Room Session (routiq-session-<uuid>)                 │ │
    │  │  • Frontend: publish microphone track                │ │
    │  │  • Agent: subscribe microphone, publish synth audio  │ │
    │  │  • Browser: subscribe agent audio, play via speaker  │ │
    │  └──────────────────────────────────────────────────────┘ │
    └──────────────────────────────────────────────────────────────┘
```

---

## Contact & Support

For issues during testing, refer to:

- **Frontend Transport**: [frontend/src/services/audio/livekitTransport.ts](../../frontend/src/services/audio/livekitTransport.ts)
- **Backend Config**: [backend/app/config.py](../../backend/app/config.py)
- **LiveKit Agent**: [backend/app/services/livekit_agent.py](../../backend/app/services/livekit_agent.py)
- **Fatigue Engine**: [backend/app/services/fatigue.py](../../backend/app/services/fatigue.py)

---

**Last Updated**: Current Session
**Status**: Ready for Testing Phase
**Target**: 10+ turn conversation with zero microphone restarts
