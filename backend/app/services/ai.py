"""AI assistant for Sleep Drive (Google Gemini).

The conversation loop works fully offline with scripted questions; when
AI_API_KEY is configured, Gemini phrases the questions and acknowledgements.
The key lives only in the backend — never in frontend code.
"""
from __future__ import annotations

import asyncio

import httpx

from app.config import settings

SYSTEM_PROMPT = (
    "You are RoadSafe AI's Sleep Drive assistant, a conversational fatigue-detection "
    "system for drivers. You talk briefly, naturally, and NEVER repetitively. "
    "Rules: keep replies to ONE short sentence (under 18 words). "
    "When intent is 'question', ask a light check-in question a driver can answer in a "
    "few words (driving, alertness, music, surroundings — vary it). "
    "When intent is 'reply', acknowledge the driver's message in one short sentence; "
    "if their words suggest drowsiness, confusion or tiredness, gently suggest "
    "pulling over safely. Never claim medical diagnosis. "
    "When intent is 'freeform', answer road-safety questions helpfully and briefly."
)

GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"


async def ask_gemini(intent: str, history: list[dict], session_id: str = "") -> str | None:
    if not settings.has_ai:
        return None
    try:
        turns = "\n".join(
            f"{'Driver' if m.get('role') == 'user' else 'Assistant'}: {m.get('content', '')}"
            for m in history[-8:]
        )
        prompt = f"{SYSTEM_PROMPT}\n\nintent: {intent}\n\nRecent conversation:\n{turns or '(none yet)'}"
        url = GEMINI_URL.format(model=settings.gemini_model)
        async with httpx.AsyncClient(timeout=settings.gemini_timeout) as client:
            resp = await client.post(
                f"{url}?key={settings.ai_api_key}",
                json={"contents": [{"role": "user", "parts": [{"text": prompt}]}]},
            )
            resp.raise_for_status()
            data = resp.json()
        text = (data.get("candidates") or [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")
        text = text.strip().strip('"')
        if text and not text.startswith("Error"):
            return text
    except Exception:
        return None
    return None


async def assistant_reply(intent: str, history: list[dict],
                          scripted: str, session_id: str = "") -> tuple[str, str]:
    """Returns (reply, source) — 'ai' when Gemini answered, else the scripted text."""
    ai = await ask_gemini(intent, history, session_id)
    if ai:
        return ai, "ai"
    return scripted, "scripted"
