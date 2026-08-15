# Sleep Drive LiveKit migration plan

## Inspection findings

The current Sleep Drive flow is still built around the browser transport in [frontend/src/services/audio/transport.ts](frontend/src/services/audio/transport.ts):

- the browser microphone is opened and managed directly
- browser `SpeechRecognition` or a Sarvam VAD capture owns the mic lifecycle
- text is sent through the fatigue chat/TTS flow
- TTS is played via browser `speechSynthesis` or a pre-rendered remote audio element
- the fatigue engine is fed through the custom conversation manager in [frontend/src/services/conversation/manager.ts](frontend/src/services/conversation/manager.ts)

This is the exact source of the reliability problems called out in the brief:

- mic lifecycle tied to single turns
- audio mixing / speech synthesis collisions
- delayed first greeting
- TTS/barge-in instability
- duplicate audio ownership between browser TTS and Sarvam audio

The fatigue intelligence remains sound and separate in [backend/app/services/fatigue.py](backend/app/services/fatigue.py). It consumes event streams, tracks response latency, silence, engagement, and baseline deviation, and should remain the authoritative fatigue inference engine.

## Migration strategy

### Phase 1 — isolate the live transport

Add a dedicated LiveKit-backed session path, but keep the existing fatigue engine and React UI intact. The old browser-specific transport remains as a fallback until the live transport is proven.

### Phase 2 — add backend token + agent scaffolding

- add LiveKit env config to [backend/app/config.py](backend/app/config.py)
- expose a signed token endpoint from [backend/app/main.py](backend/app/main.py)
- create a dedicated LiveKit agent manager in [backend/app/services/livekit_agent.py](backend/app/services/livekit_agent.py)
- keep Sarvam as the authoritative STT/TTS voice provider for the live agent path

### Phase 3 — connect the frontend session

- add a LiveKit browser client service in [frontend/src/services/livekit.ts](frontend/src/services/livekit.ts)
- join a room and publish the microphone via the LiveKit session
- keep the existing fatigue manager as the telemetry consumer, not the raw audio owner

### Phase 4 — keep the fatigue engine authoritative

Map LiveKit conversation telemetry to the existing fatigue events without changing the fatigue algorithm itself.

### Phase 5 — verify in browser

Use the real browser flow to validate connection, language switching, interruption, multi-turn continuity, and recovery after errors.

## Current status

This initial pass adds the migration seams and config so the project can use LiveKit without rewriting the rest of Routiq. Full real-time verification still depends on LiveKit credentials and a browser session with the actual voice services configured.
