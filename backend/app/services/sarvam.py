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

import time
from collections import OrderedDict
from typing import Any

from app.config import settings
from app.services.http import Log, request_with_retry, safe_exc

# Deterministic TTS phrases are cached to cut latency + API spend. Only
# short, fixed utterances qualify (personalized replies never are). The
# cache is BOUNDED (LRU + TTL) so a long-running process cannot leak memory
# — entries expire and the oldest are evicted beyond the cap.
_TTS_CACHE: OrderedDict[tuple[str, str], tuple[float, str]] = OrderedDict()
_TTS_CACHE_MAX = 256
_TTS_CACHE_TTL_S = 60 * 60  # 1 hour

CACHEABLE_MIN_LEN = 2
CACHEABLE_MAX_LEN = 60


def _cache_get(key: tuple[str, str]) -> str | None:
    item = _TTS_CACHE.get(key)
    if item is None:
        return None
    ts, audio = item
    if time.time() - ts > _TTS_CACHE_TTL_S:
        _TTS_CACHE.pop(key, None)
        return None
    _TTS_CACHE.move_to_end(key)
    return audio


def _cache_put(key: tuple[str, str], audio: str) -> None:
    _TTS_CACHE[key] = (time.time(), audio)
    _TTS_CACHE.move_to_end(key)
    while len(_TTS_CACHE) > _TTS_CACHE_MAX:
        _TTS_CACHE.popitem(last=False)


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
            resp = await request_with_retry(
                "POST",
                f"{self.base}/speech-to-text",
                headers=self._headers(),
                files=files,
                timeout=self.timeout,
                tag="sarvam",
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
                "provider": "sarvam",
            }
        except Exception as exc:  # noqa: BLE001 — fail soft
            Log.warn("sarvam", f"stt failed ({safe_exc(exc)}) — browser STT fallback")
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
            hit = _cache_get(key)
            if hit:
                return {"audio_base64": hit, "format": "wav", "source": "sarvam", "cached": True}
        try:
            resp = await request_with_retry(
                "POST",
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
                timeout=self.timeout,
                tag="sarvam",
            )
            resp.raise_for_status()
            data = resp.json()
            audios = data.get("audios") or []
            if not audios:
                return None
            combined = "".join(audios)
            if settings.tts_cache_enabled and CACHEABLE_MIN_LEN <= len(text) <= CACHEABLE_MAX_LEN:
                _cache_put(key, combined)
            return {"audio_base64": combined, "format": "wav", "source": "sarvam", "provider": "sarvam", "cached": False}
        except Exception as exc:  # noqa: BLE001 — fail soft
            Log.warn("sarvam", f"tts failed ({safe_exc(exc)}) — browser TTS fallback")
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
