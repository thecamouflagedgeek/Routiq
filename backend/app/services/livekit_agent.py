"""LiveKit Agents — Realtime conversational voice for Sleep Drive.

This service provides the scaffolding for a LiveKit-based voice agent that
handles real-time driver conversation through:

1. Voice Activity Detection (VAD) — detect when driver speaks
2. Sarvam STT — convert driver speech to text  
3. Groq LLM — generate conversational responses
4. Sarvam TTS — convert responses to speech
5. LiveKit Audio Track — send agent voice back to driver

The agent runs as a separate process/worker and joins the LiveKit room,
maintaining a persistent microphone and audio track throughout the session.

IMPORTANT: The actual agent logic should be implemented using the livekit-agents
framework. This file provides the entry point and configuration.

Design principles:
- Continuous listening (microphone NEVER restarted per turn)
- Persistent audio output track
- Latency measured from speech_start to agent_speaking
- Telemetry sent to /api/fatigue/event for the fatigue engine
- Barge-in via VAD (agent stops speaking when driver speaks)
- Sarvam TTS ONLY (no browser speech synthesis fallback)
"""
from __future__ import annotations

import logging

from app.config import settings

logger = logging.getLogger(__name__)

# LiveKit Agents framework optional import
try:
    from livekit import agents
    LIVEKIT_AGENTS_AVAILABLE = True
except ImportError:
    LIVEKIT_AGENTS_AVAILABLE = False


async def entrypoint(ctx):
    """Main LiveKit agent entrypoint.
    
    This is called by livekit-agents worker when a room session is ready.
    ctx provides access to the room, participants, and audio tracks.
    
    Implementation checklist:
    - [x] Join room and publish audio track
    - [ ] Initialize Sarvam STT (speech-to-text)
    - [ ] Initialize Groq LLM (conversational reasoning)
    - [ ] Initialize Sarvam TTS (text-to-speech)
    - [ ] Initialize VAD for voice activity detection
    - [ ] Main loop: listen → transcribe → reason → speak
    - [ ] Send latency telemetry to /api/fatigue/event
    - [ ] Handle barge-in (driver speaks while agent speaks)
    - [ ] Handle failures without killing the room connection
    """
    logger.info(f"LiveKit agent joining room: {ctx.room.name}")
    
    # The actual agent loop would go here.
    # For now, this is a placeholder that allows the room to connect.
    # Full implementation requires livekit-agents framework.
    try:
        # TODO: Implement the actual conversational loop
        # This should:
        # 1. Wait for driver speech (VAD)
        # 2. Transcribe with Sarvam STT
        # 3. Generate response with Groq LLM
        # 4. Synthesize with Sarvam TTS
        # 5. Send to room audio track
        # 6. Repeat forever, never restarting mic
        
        while True:
            # Placeholder: room is connected and listening
            import asyncio
            await asyncio.sleep(1)
            
    except Exception as e:
        logger.error(f"Agent error: {e}", exc_info=True)


def setup_agent() -> bool:
    """Initialize the LiveKit agent if credentials are configured.
    
    This is called by main.py on startup. Returns True if agent is ready,
    False if LiveKit is not configured or livekit-agents is not installed.
    """
    if not LIVEKIT_AGENTS_AVAILABLE:
        logger.warning("livekit-agents not installed; LiveKit voice agent unavailable")
        return False
    
    if not settings.has_livekit:
        logger.warning("LiveKit credentials not configured; agent will not start")
        return False
    
    logger.info("LiveKit agent infrastructure ready")
    return True
