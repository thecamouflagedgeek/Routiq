"""ElevenLabs text-to-speech provider for Sleep Drive.

This service is the preferred TTS path for the driver-assistant voice loop.
It returns base64 MP3 audio so the frontend can stream it without depending on
browser speech synthesis.
"""
from __future__ import annotations

from typing import Any

from app.config import settings
from app.services.http import Log, request_with_retry, safe_exc


class ElevenLabsService:
    def __init__(self) -> None:
        self.url = f"{settings.elevenlabs_url}/text-to-speech/{settings.elevenlabs_voice_id}"
        self.timeout = settings.elevenlabs_timeout

    @property
    def available(self) -> bool:
        return bool(settings.elevenlabs_api_key)

    async def synthesize(self, text: str, language: str = "en-IN") -> dict[str, Any] | None:
        if not self.available or not text or not text.strip():
            return None

        payload = {
            "text": text.strip(),
            "model_id": settings.elevenlabs_model_id,
            "voice_settings": {
                "stability": 0.45,
                "similarity_boost": 0.9,
                "style": 0.2,
                "use_speaker_boost": True,
            },
        }
        headers = {
            "Accept": "audio/mpeg",
            "Content-Type": "application/json",
            "xi-api-key": settings.elevenlabs_api_key,
        }

        try:
            resp = await request_with_retry(
                "POST",
                self.url,
                headers=headers,
                json=payload,
                timeout=self.timeout,
                tag="elevenlabs",
            )
            resp.raise_for_status()
            data = resp.content
            if not data:
                return None
            import base64
            return {
                "audio_base64": base64.b64encode(data).decode("utf-8"),
                "format": "mp3",
                "source": "elevenlabs",
                "provider": "elevenlabs",
                "cached": False,
            }
        except Exception as exc:  # noqa: BLE001 — fail soft to browser TTS
            Log.warn("elevenlabs", f"tts failed ({safe_exc(exc)}) — browser TTS fallback")
            return None


elevenlabs_service = ElevenLabsService()
