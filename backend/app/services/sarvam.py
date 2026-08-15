"""Sarvam speech services for Sleep Drive — Saaras v3 STT + Bulbul v3 TTS.

Production pipeline intent: browser/car audio -> this service -> transcript
(with detected language) for the Conversation Manager; and reply text ->
natural Indian voice audio for the car speakers.

Rules:
- The API key lives ONLY in backend env config (never in responses or logs).
- Every method returns None / a safe "unavailable" shape on any failure so
  the app falls back to browser STT / browser TTS without breaking the loop.
- No raw audio is persisted server-side; we pass bytes straight through.
"""
from __future__ import annotations

import base64
from typing import Any

import httpx

from app.config import settings

# Deterministic TTS phrases are cached to cut latency + API spend. Only
# short, fixed utterances qualify (personalized replies never are).
_TTS_CACHE: dict[tuple[str, str], str] = {}

CACHEABLE_MIN_LEN = 2
CACHEABLE_MAX_LEN = 60


class SarvamService:
    def __init__(self) -> None:
        self.base = settings.sarvam_url
        self.stt_model = settings.sarvam_stt_model
        self.tts_model = settings.sarvam_tts_model
        self.tts_voice = settings.sarvam_tts_voice
        self.timeout = settings.sarvam_timeout

    @property
    def available(self) -> bool:
        return settings.has_sarvam

    def _headers(self) -> dict[str, str]:
        return {"api-subscription-key": settings.sarvam_api_key}

    # ------------------------------------------------------------------ STT
    async def transcribe(
        self,
        audio_bytes: bytes,
        language_hint: str = "auto",
        mode: str = "transcribe",
    ) -> dict[str, Any] | None:
        """Transcribe audio via Saaras v3. Returns None on any failure.

        Response shape (Sarvam): {request_id, transcript, language_code}.
        """
        if not self.available or not audio_bytes:
            return None
        try:
            files = {
                "file": ("audio.wav", audio_bytes, "audio/wav"),
                "model": (None, self.stt_model),
                "mode": (None, mode),
            }
            if language_hint and language_hint != "auto":
                files["language_code"] = (None, language_hint)
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                resp = await client.post(
                    f"{self.base}/speech-to-text",
                    headers=self._headers(),
                    files=files,
                )
                resp.raise_for_status()
                data = resp.json()
            transcript = (data.get("transcript") or "").strip()
            if not transcript:
                return None
            return {
                "transcript": transcript,
                "language_code": data.get("language_code"),
                "source": "sarvam",
            }
        except Exception as exc:  # noqa: BLE001 — fail soft
            print(f"[sarvam] stt failed ({type(exc).__name__}) — browser STT fallback", flush=True)
            return None

    # ------------------------------------------------------------------ TTS
    async def synthesize(self, text: str, language: str = "en-IN") -> dict[str, Any] | None:
        """Synthesize speech via Bulbul v3 -> base64 WAV. Caches deterministic
        phrases. Returns None on failure (caller falls back to browser TTS)."""
        if not self.available or not text or not text.strip():
            return None
        text = text.strip()
        # Deterministic short utterances (acknowledgements, offers) are cached.
        key = (text, language)
        if settings.tts_cache_enabled and CACHEABLE_MIN_LEN <= len(text) <= CACHEABLE_MAX_LEN:
            hit = _TTS_CACHE.get(key)
            if hit:
                return {"audio_base64": hit, "format": "wav", "source": "sarvam", "cached": True}
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                resp = await client.post(
                    f"{self.base}/text-to-speech",
                    headers=self._headers(),
                    json={
                        "text": text,
                        "language_code": language,
                        "speaker": self.tts_voice,
                        "model": self.tts_model,
                        "pace": 1.0,
                        "speech_sample_rate": 24000,
                    },
                )
                resp.raise_for_status()
                data = resp.json()
            audios = data.get("audios") or []
            if not audios:
                return None
            combined = "".join(audios)
            if settings.tts_cache_enabled and CACHEABLE_MIN_LEN <= len(text) <= CACHEABLE_MAX_LEN:
                _TTS_CACHE[key] = combined
            return {"audio_base64": combined, "format": "wav", "source": "sarvam", "cached": False}
        except Exception as exc:  # noqa: BLE001 — fail soft
            print(f"[sarvam] tts failed ({type(exc).__name__}) — browser TTS fallback", flush=True)
            return None

    # ----------------------------------------------------------- language id
    async def detect_language(self, audio_bytes: bytes) -> str | None:
        """Language identification from an utterance via Saaras v3's detected
        language_code (BCP-47). Returns None if undetectable."""
        result = await self.transcribe(audio_bytes, language_hint="auto")
        if not result:
            return None
        return result.get("language_code")


# Module-level singleton.
sarvam_service = SarvamService()
