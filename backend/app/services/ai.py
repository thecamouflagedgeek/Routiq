"""AI assistant for Sleep Drive (Google Gemini).

The conversation loop works fully offline with scripted questions; when
AI_API_KEY is configured, Gemini phrases the questions and acknowledgements.
The key lives only in the backend — never in frontend code.
"""
from __future__ import annotations

import httpx

from app.config import settings

SYSTEM_PROMPT = (
    "You are RoadSafe AI's Sleep Drive companion — a calm passenger keeping a driver "
    "company, not an interrogator running a checklist. Talk like a real person in the "
    "car: brief, warm, occasionally a little conversational. "
    "Rules: ONE sentence, under 18 words. Never reuse a phrase from the recent "
    "conversation. Don't always ask a question — sometimes just react or comment. "
    "Match tone to concern level (given below): "
    "level 0 — relaxed, can chat about the drive, music, or just acknowledge what they "
    "said without immediately quizzing them again; "
    "level 1 — a bit more attentive, but still gentle, not alarmed; "
    "level 2 — genuinely concerned, ask directly if they're okay; "
    "level 3 — calm but firm, tell them to pull over. "
    "When intent is 'question': at level 0, mix it up — ask about the drive, make an "
    "observation, or follow up on something the driver said earlier, instead of always "
    "issuing a fresh check-in. At level 1+, keep it a direct but caring check-in. "
    "When intent is 'reply': react specifically to what the driver just said — if they "
    "mentioned something (traffic, music, tiredness, a place), respond to THAT, not a "
    "generic acknowledgement. Only pivot to suggesting a break if their words or the "
    "concern level actually warrant it. Never claim medical diagnosis. "
    "When intent is 'freeform', answer road-safety questions helpfully and briefly."
)

GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"


async def ask_gemini(
    intent: str,
    history: list[dict],
    session_id: str = "",
    escalation_level: int = 0,
    slow_responses: int = 0,
    missed_responses: int = 0,
    session_seconds: float | None = None,
) -> str | None:
    if not settings.has_ai:
        return None
    try:
        # wider window so the model actually has a thread to sound like it
        # remembers the drive, not just the last back-and-forth
        turns = "\n".join(
            f"{'Driver' if m.get('role') == 'user' else 'Assistant'}: {m.get('content', '')}"
            for m in history[-12:]
        )
        context_bits = [f"concern level: {escalation_level}/3 (slow: {slow_responses}, missed: {missed_responses})"]
        if session_seconds is not None:
            minutes = round(session_seconds / 60, 1)
            context_bits.append(f"session running for ~{minutes} min")
        context = " | ".join(context_bits)

        prompt = (
            f"{SYSTEM_PROMPT}\n\nintent: {intent}\n{context}\n\n"
            f"Recent conversation:\n{turns or '(none yet)'}"
        )
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


async def assistant_reply(
    intent: str,
    history: list[dict],
    scripted: str,
    session_id: str = "",
    escalation_level: int = 0,
    slow_responses: int = 0,
    missed_responses: int = 0,
    session_seconds: float | None = None,
) -> tuple[str, str]:
    ai = await ask_gemini(
        intent, history, session_id, escalation_level, slow_responses, missed_responses, session_seconds
    )
    if ai:
        return ai, "ai"
    return scripted, "scripted"