# LiveKit Agent Implementation Guide

## Overview

This guide provides step-by-step instructions for implementing the full `entrypoint()` function in [backend/app/services/livekit_agent.py](backend/app/services/livekit_agent.py).

The agent orchestrates a real-time conversation loop:

1. **VAD** (Silero) — detect driver speech
2. **STT** (Sarvam) — transcribe speech to text
3. **LLM** (Groq) — generate response
4. **TTS** (Sarvam) — synthesize response to audio
5. **Publish** — send to LiveKit room audio track
6. **Telemetry** — emit to `/api/fatigue/event` for fatigue engine

The loop runs **continuously** in the backend while the frontend publishes/subscribes to the same room.

---

## Architecture Reminder

```
Frontend (React + Browser WebRTC)           Backend (Python + livekit-agents)
┌───────────────────────────────────┐      ┌──────────────────────────────────┐
│ SleepDrive UI                     │      │ LiveKit Agent Service            │
│ + LiveKitTransport                │      │                                  │
│   ├─ Publish: Driver Microphone   │      │ async entrypoint(ctx):           │
│   └─ Subscribe: Agent Audio       │      │   1. VAD loop                   │
└───────────────────────────────────┘      │   2. STT (driver speech)        │
          ▲                                 │   3. LLM (generate response)    │
          │ WebRTC                         │   4. TTS (synthesize response)  │
          │ (bidirectional audio)          │   5. Publish to room audio      │
          │                                │   6. Emit telemetry             │
          │                                │   7. Loop forever               │
          │                                └──────────────────────────────────┘
          └────────────── LiveKit Room ────────────────┘
             (Persistent persistent room with both participants)
```

---

## Implementation Steps

### Step 1: Install and Import Dependencies

Ensure `requirements.txt` has these packages:

```
livekit-agents>=0.10.0
livekit-plugins-silero-vad>=0.10.0
livekit-plugins-sarvam>=0.10.0  # (if available; otherwise use direct HTTP)
livekit-plugins-groq>=0.10.0    # (if available; otherwise use direct HTTP)
```

If plugins are not available for Sarvam/Groq, use direct HTTP calls via [app/services/sarvam.py](app/services/sarvam.py) and [app/services/groq.py](app/services/groq.py).

### Step 2: Basic Entrypoint Structure

Replace the placeholder in `livekit_agent.py`:

```python
async def entrypoint(ctx):
    """Main LiveKit agent entrypoint."""
    logger.info(f"Agent joining room: {ctx.room.name}")

    try:
        # Initialize services
        # Create VAD, STT, LLM, TTS instances

        # Main loop
        async for user_speech_frame in vad_loop(ctx):
            # Receive speech, transcribe, reason, speak
            pass

    except Exception as e:
        logger.error(f"Agent error: {e}", exc_info=True)
        raise
    finally:
        logger.info(f"Agent exiting room: {ctx.room.name}")
```

### Step 3: Initialize Services

```python
async def entrypoint(ctx):
    logger.info(f"Agent joining room: {ctx.room.name}")

    # Step 3a: Get access to room participant audio
    # The frontend publishes its microphone as a remote track.
    # We need to subscribe to it and process the audio stream.

    # Example using livekit-agents framework:
    from livekit.agents import vad, speech_text, text_speech
    from livekit.plugins import silero, sarvam, groq

    # Initialize VAD (Silero Voice Activity Detection)
    try:
        vad_engine = silero.VAD.load()
        logger.info("✓ Silero VAD loaded")
    except Exception as e:
        logger.error(f"VAD load failed: {e}")
        return

    # Initialize STT (Sarvam Speech-to-Text)
    # You can either:
    # a) Use livekit-plugins-sarvam (if available), OR
    # b) Call app.services.sarvam.SarvamService directly

    try:
        from app.services.sarvam import SarvamService
        stt_service = SarvamService(api_key=settings.sarvam_api_key)
        logger.info("✓ Sarvam STT service initialized")
    except Exception as e:
        logger.error(f"STT init failed: {e}")
        return

    # Initialize LLM (Groq Language Model)
    try:
        from app.services.groq import GroqService
        llm_service = GroqService(api_key=settings.groq_api_key)
        logger.info("✓ Groq LLM service initialized")
    except Exception as e:
        logger.error(f"LLM init failed: {e}")
        return

    # Initialize TTS (Sarvam Text-to-Speech)
    try:
        from app.services.sarvam import SarvamService
        tts_service = SarvamService(api_key=settings.sarvam_api_key)
        logger.info("✓ Sarvam TTS service initialized")
    except Exception as e:
        logger.error(f"TTS init failed: {e}")
        return

    # Step 3b: Create audio context for output
    # This is how we publish our synthesized speech back to the room.
    audio_source = agents.AudioSource(
        sample_rate=16000,
        num_channels=1,
        format=agents.AudioEncoding.LINEAR16
    )
    await ctx.publish_audio(audio_source)
    logger.info("✓ Audio source published to room")
```

### Step 4: Main Conversation Loop

```python
    # Step 4: Main loop — listen, transcribe, reason, speak

    import asyncio
    import time

    conversation_history = []  # Track turns for context
    current_language = "en"    # Default to English

    async def main_loop():
        """Continuous conversation loop."""
        while True:
            try:
                # Step 4a: Listen for driver speech using VAD
                logger.info("Waiting for driver speech...")
                driver_audio = bytearray()
                speech_started = False
                speech_timeout = 30  # seconds

                async for frame in vad_engine.detect(
                    ctx.subscribe_to_remote_audio(ctx.room.name)
                ):
                    if frame.is_speech:
                        speech_started = True
                        driver_audio.extend(frame.data)
                    elif speech_started:
                        # Speech ended, process the collected audio
                        break

                    # Timeout if no speech for too long
                    if not speech_started and time.time() > speech_timeout:
                        logger.warning("Speech timeout, waiting again...")
                        break

                if not driver_audio:
                    await asyncio.sleep(0.1)
                    continue

                # Step 4b: Transcribe driver speech with Sarvam STT
                logger.info(f"Transcribing {len(driver_audio)} bytes of speech...")
                try:
                    driver_transcript = await stt_service.transcribe_async(
                        audio=bytes(driver_audio),
                        language=current_language,
                        encoding="linear16",
                        sample_rate=16000
                    )
                    logger.info(f"Driver: {driver_transcript}")
                except Exception as e:
                    logger.error(f"STT failed: {e}")
                    driver_transcript = ""

                if not driver_transcript:
                    continue

                # Step 4c: Check for language switch command
                if "switch to hindi" in driver_transcript.lower():
                    current_language = "hi"
                    response_text = "ठीक है, मैं हिंदी में बोलूंगा।"  # OK, I'll speak in Hindi
                    logger.info(f"Language switched to: {current_language}")
                elif "switch to english" in driver_transcript.lower():
                    current_language = "en"
                    response_text = "Okay, I'll speak in English."
                    logger.info(f"Language switched to: {current_language}")
                else:
                    # Step 4d: Generate response with Groq LLM
                    conversation_history.append({
                        "role": "user",
                        "content": driver_transcript
                    })

                    # Get current fatigue state for context
                    # (This would require a call to fatigue_engine)
                    # For now, use a simple prompt

                    try:
                        response_text = await llm_service.complete_async(
                            prompt=driver_transcript,
                            language=current_language,
                            context=conversation_history[-5:]  # Last 5 turns for context
                        )
                        logger.info(f"LLM: {response_text}")
                    except Exception as e:
                        logger.error(f"LLM failed: {e}")
                        response_text = "I'm having trouble understanding. Can you repeat that?"

                # Step 4e: Synthesize response with Sarvam TTS
                logger.info(f"Synthesizing: {response_text[:50]}...")
                try:
                    audio_bytes = await tts_service.synthesize_async(
                        text=response_text,
                        language=current_language
                    )
                    logger.info(f"Generated {len(audio_bytes)} bytes of audio")
                except Exception as e:
                    logger.error(f"TTS failed: {e}")
                    continue

                # Step 4f: Publish to room audio track
                await audio_source.write_frame(
                    agents.AudioFrame(
                        data=audio_bytes,
                        sample_rate=16000,
                        num_channels=1,
                        format=agents.AudioEncoding.LINEAR16
                    )
                )

                # Step 4g: Record turn in history
                conversation_history.append({
                    "role": "assistant",
                    "content": response_text
                })

                # Step 4h: Emit telemetry to fatigue engine
                try:
                    import httpx
                    async with httpx.AsyncClient() as client:
                        await client.post(
                            "http://localhost:8000/api/fatigue/event",
                            json={
                                "event_type": "response_received",
                                "metadata": {
                                    "driver_input": driver_transcript[:100],
                                    "agent_response": response_text[:100],
                                    "latency_ms": time.time() * 1000,  # In real code, measure properly
                                    "language": current_language
                                }
                            }
                        )
                except Exception as e:
                    logger.warning(f"Telemetry failed: {e}")

            except Exception as e:
                logger.error(f"Loop error: {e}", exc_info=True)
                await asyncio.sleep(1)

    # Run the main loop
    await main_loop()
```

### Step 5: Handle Barge-In (Interruption)

```python
    # Barge-in means: driver starts speaking while agent is speaking
    # Solution: VAD detects new driver speech and immediately:
    #   1. Stops ongoing TTS playback
    #   2. Clears audio buffer
    #   3. Processes new driver input

    # This is handled naturally by the VAD loop above — when VAD
    # detects new speech after a gap, the previous speech processing
    # yields, and the loop processes the new input.

    # For more explicit control, you can:
    #   1. Track audio_source state
    #   2. Cancel ongoing TTS on new VAD trigger
    #   3. Clear the audio buffer

    # Example (add to Step 4):

    speech_interrupted = asyncio.Event()

    async def interrupt_on_vad():
        """Cancel ongoing speech if driver speaks."""
        last_vad_time = time.time()
        async for frame in vad_engine.detect(...):
            if frame.is_speech:
                if time.time() - last_vad_time > 1:  # New speech detected
                    logger.info("Driver interrupted, cancelling TTS")
                    speech_interrupted.set()
                last_vad_time = time.time()
```

---

## Full Template Implementation

Here's a complete, ready-to-adapt template:

```python
# backend/app/services/livekit_agent.py

import asyncio
import logging
import time
from typing import Any, Dict

from app.config import settings

logger = logging.getLogger(__name__)

try:
    from livekit import agents
    LIVEKIT_AGENTS_AVAILABLE = True
except ImportError:
    LIVEKIT_AGENTS_AVAILABLE = False


async def entrypoint(ctx) -> None:
    """
    Main LiveKit agent entrypoint.

    Runs the conversation loop:
    1. VAD (Silero) detects driver speech
    2. STT (Sarvam) transcribes to text
    3. LLM (Groq) generates response
    4. TTS (Sarvam) synthesizes response audio
    5. Publishes to room audio track
    6. Emits telemetry to /api/fatigue/event
    7. Loops forever, never restarting microphone
    """

    logger.info(f"LiveKit agent starting in room: {ctx.room.name}")

    if not settings.has_livekit:
        logger.error("LiveKit not configured")
        return

    if not settings.has_sarvam:
        logger.error("Sarvam not configured")
        return

    if not settings.has_groq:
        logger.error("Groq not configured")
        return

    try:
        # ========== Service Initialization ==========

        # VAD: Silero Voice Activity Detection
        logger.info("Initializing Silero VAD...")
        try:
            from livekit.plugins import silero
            vad_engine = await silero.VAD.load()
            logger.info("✓ VAD initialized")
        except Exception as e:
            logger.error(f"VAD initialization failed: {e}")
            return

        # STT: Sarvam Speech-to-Text
        logger.info("Initializing Sarvam STT...")
        try:
            from app.services.sarvam import SarvamService
            stt_service = SarvamService(api_key=settings.sarvam_api_key)
            logger.info("✓ STT initialized")
        except Exception as e:
            logger.error(f"STT initialization failed: {e}")
            return

        # LLM: Groq Language Model
        logger.info("Initializing Groq LLM...")
        try:
            from app.services.groq import GroqService
            llm_service = GroqService(api_key=settings.groq_api_key)
            logger.info("✓ LLM initialized")
        except Exception as e:
            logger.error(f"LLM initialization failed: {e}")
            return

        # TTS: Sarvam Text-to-Speech
        logger.info("Initializing Sarvam TTS...")
        try:
            from app.services.sarvam import SarvamService
            tts_service = SarvamService(api_key=settings.sarvam_api_key)
            logger.info("✓ TTS initialized")
        except Exception as e:
            logger.error(f"TTS initialization failed: {e}")
            return

        # Create audio source for output to room
        logger.info("Creating audio source...")
        audio_source = agents.AudioSource(
            sample_rate=16000,
            num_channels=1,
        )
        await ctx.publish_audio(audio_source)
        logger.info("✓ Audio source published to room")

        # ========== Conversation State ==========

        conversation_history: list[Dict[str, str]] = []
        current_language = "en"
        turn_count = 0

        # ========== Main Loop ==========

        logger.info("Starting conversation loop...")

        async def run_conversation():
            """Main conversation loop."""
            nonlocal turn_count, current_language

            while True:
                turn_count += 1
                logger.info(f"--- Turn {turn_count} ---")

                try:
                    # ===== Step 1: Listen for driver speech =====
                    logger.info("Waiting for driver speech (VAD)...")

                    driver_audio = bytearray()
                    speech_detected = False
                    timeout = 60
                    start_time = time.time()

                    # Subscribe to remote audio from frontend
                    # (frontend publishes microphone as a remote track)
                    try:
                        # Get the remote participant (driver)
                        remote_participants = list(ctx.room.remote_participants.values())
                        if not remote_participants:
                            logger.warning("No remote participants yet, waiting...")
                            await asyncio.sleep(1)
                            continue

                        remote_participant = remote_participants[0]
                        audio_tracks = [
                            track for track in remote_participant.tracks.values()
                            if track.kind == "audio"
                        ]

                        if not audio_tracks:
                            logger.warning("No audio tracks from remote participant")
                            await asyncio.sleep(1)
                            continue

                        # Use VAD on the audio track
                        audio_stream = agents.AudioFrame.from_track(
                            audio_tracks[0]
                        )

                        async for frame in vad_engine.detect(audio_stream):
                            if frame.is_speech:
                                speech_detected = True
                                driver_audio.extend(frame.data)
                            elif speech_detected and len(driver_audio) > 0:
                                # Speech ended
                                break

                            if time.time() - start_time > timeout:
                                logger.warning("Timeout waiting for speech")
                                break

                        if not driver_audio or not speech_detected:
                            logger.info("No speech detected, retrying...")
                            await asyncio.sleep(0.5)
                            continue

                    except Exception as e:
                        logger.error(f"Audio capture failed: {e}")
                        await asyncio.sleep(1)
                        continue

                    # ===== Step 2: Transcribe with Sarvam STT =====
                    logger.info(f"Transcribing audio ({len(driver_audio)} bytes)...")
                    try:
                        driver_text = await stt_service.transcribe_async(
                            audio=bytes(driver_audio),
                            language=current_language
                        )
                        if not driver_text:
                            logger.info("STT returned empty, skipping turn")
                            continue
                        logger.info(f"Driver said: '{driver_text}'")
                    except Exception as e:
                        logger.error(f"STT failed: {e}")
                        continue

                    # ===== Step 3: Check for language command =====
                    if "hindi" in driver_text.lower():
                        current_language = "hi"
                        agent_text = "ठीक है, मैं हिंदी में बोलूंगा।"
                        logger.info(f"Language switched to: {current_language}")
                    elif "english" in driver_text.lower():
                        current_language = "en"
                        agent_text = "Okay, I'll speak in English."
                        logger.info(f"Language switched to: {current_language}")
                    else:
                        # ===== Step 4: Generate response with Groq LLM =====
                        conversation_history.append({
                            "role": "user",
                            "content": driver_text
                        })

                        logger.info("Querying Groq LLM...")
                        try:
                            agent_text = await llm_service.complete_async(
                                prompt=driver_text,
                                language=current_language,
                                context=conversation_history
                            )
                            if not agent_text:
                                agent_text = "I'm here to help with your driving safety. Can you tell me more?"
                            logger.info(f"Agent will say: '{agent_text}'")
                        except Exception as e:
                            logger.error(f"LLM failed: {e}")
                            agent_text = "I'm having trouble. Can you repeat that?"

                    # ===== Step 5: Synthesize with Sarvam TTS =====
                    logger.info("Synthesizing TTS...")
                    try:
                        audio_bytes = await tts_service.synthesize_async(
                            text=agent_text,
                            language=current_language
                        )
                        if not audio_bytes:
                            logger.error("TTS returned empty")
                            continue
                        logger.info(f"TTS generated {len(audio_bytes)} bytes")
                    except Exception as e:
                        logger.error(f"TTS failed: {e}")
                        continue

                    # ===== Step 6: Publish to room audio track =====
                    logger.info("Publishing to room audio...")
                    try:
                        await audio_source.capture_frame(
                            agents.AudioFrame(
                                data=audio_bytes,
                                sample_rate=16000,
                                num_channels=1,
                            )
                        )
                    except Exception as e:
                        logger.error(f"Audio publish failed: {e}")
                        continue

                    # ===== Step 7: Record in history =====
                    conversation_history.append({
                        "role": "assistant",
                        "content": agent_text
                    })

                    # Keep history bounded
                    if len(conversation_history) > 20:
                        conversation_history.pop(0)

                    # ===== Step 8: Emit telemetry =====
                    try:
                        import httpx
                        async with httpx.AsyncClient() as client:
                            await client.post(
                                "http://localhost:8000/api/fatigue/event",
                                json={
                                    "event_type": "response_received",
                                    "metadata": {
                                        "turn": turn_count,
                                        "language": current_language,
                                        "driver_speech_length": len(driver_text),
                                        "agent_response_length": len(agent_text),
                                    }
                                },
                                timeout=5
                            )
                    except Exception as e:
                        logger.warning(f"Telemetry submission failed: {e}")

                    logger.info(f"✓ Turn {turn_count} completed")

                except Exception as e:
                    logger.error(f"Turn error: {e}", exc_info=True)
                    await asyncio.sleep(1)

        # Run conversation
        await run_conversation()

    except Exception as e:
        logger.error(f"Agent fatal error: {e}", exc_info=True)
    finally:
        logger.info(f"Agent shutting down from room: {ctx.room.name}")


def setup_agent() -> bool:
    """Check if agent can be set up (all dependencies available)."""
    if not LIVEKIT_AGENTS_AVAILABLE:
        logger.warning("livekit-agents not installed")
        return False

    if not settings.has_livekit:
        logger.warning("LiveKit not configured")
        return False

    if not settings.has_sarvam:
        logger.warning("Sarvam not configured")
        return False

    if not settings.has_groq:
        logger.warning("Groq not configured")
        return False

    logger.info("✓ Agent setup check passed")
    return True
```

---

## Integration into main.py

Once the agent is implemented, integrate it into [backend/app/main.py](backend/app/main.py):

```python
# At the top of main.py, after imports:
from app.services.livekit_agent import setup_agent, LIVEKIT_AGENTS_AVAILABLE

# In the app startup event:
@app.on_event("startup")
async def startup_event():
    if LIVEKIT_AGENTS_AVAILABLE and setup_agent():
        logger.info("LiveKit Agent ready")
    else:
        logger.warning("LiveKit Agent not available (optional)")
```

Then register the agent worker with LiveKit:

```python
# At the end of main.py:

if __name__ == "__main__":
    # For direct running with livekit-agents dev server:
    # cd backend && livekit-agents dev app.main:procs

    # This pattern is used by livekit-agents framework:
    procs = []
    if LIVEKIT_AGENTS_AVAILABLE and setup_agent():
        from livekit.agents import proc
        procs.append(proc.VoiceAssistant(entrypoint=entrypoint))
```

---

## Async Patterns

The code uses async/await heavily. Key patterns:

```python
# Subscribe to audio stream
async for frame in vad_engine.detect(audio_stream):
    # Process frame
    pass

# Call async service
result = await stt_service.transcribe_async(audio, language)

# Publish to room
await audio_source.capture_frame(frame)

# HTTP call
async with httpx.AsyncClient() as client:
    response = await client.post(url, json=data)
```

---

## Error Handling

Each service call is wrapped in try/except:

- **VAD failure**: Return from entrypoint (agent can't run)
- **STT failure**: Log error, continue loop
- **LLM failure**: Use fallback response, continue loop
- **TTS failure**: Log error, skip turn
- **Audio publish failure**: Log error, continue loop
- **Telemetry failure**: Log warning (non-blocking)

This ensures the agent never crashes — it gracefully handles failures and continues listening.

---

## Testing the Implementation

Once implemented:

```bash
# Terminal 1: Backend
cd backend
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# Terminal 2: Agent worker
cd backend
livekit-agents dev app.main:procs --host 0.0.0.0 --port 8081

# Terminal 3: Frontend
cd frontend
npm run dev

# Browser: http://localhost:5173/ → Sleep Drive
# Test: Say "Hey Routiq" → should hear response within 3 seconds
```

---

## Reference: Metrics to Track

For each turn, log:

1. VAD detection time (ms from speech start to VAD trigger)
2. STT latency (ms from audio end to transcription complete)
3. LLM latency (ms from prompt to response)
4. TTS latency (ms from text to audio complete)
5. Audio publish latency (ms from audio ready to published to room)
6. Total turn latency (ms from driver speech start to agent speaking)

Target: **Total turn latency < 3 seconds**

```python
import time

turn_start = time.time()
# ... VAD, STT, LLM, TTS ...
turn_latency_ms = (time.time() - turn_start) * 1000
logger.info(f"Turn {turn_count} latency: {turn_latency_ms:.0f}ms")
```

---

## Next: Browser Testing

After implementation is complete and both servers are running, execute [TESTING_GUIDE.md](TESTING_GUIDE.md) to validate the 10+ turn conversation.

---

**Status**: Implementation template ready
**Next Phase**: Fill in the async service calls and test in browser
**Target**: Zero microphone restarts across 10+ turns
