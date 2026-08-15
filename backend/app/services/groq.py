"""Groq conversational reasoning for Sleep Drive.

The LLM decides WHAT Routiq should say. It NEVER decides driver state —
the fatigue engine owns that. The service also proposes an intent for the
driver's utterance; deterministic safety rules (app/services/intent.py) always
take precedence over the model, and the application decides whether any
proposed action is permitted.

Security: the API key lives only in backend env config. It is never returned
in API responses, never logged, and never sent to the frontend. Log lines only
carry the model name and a source label.
"""
from __future__ import annotations

import json
from typing import Any

import httpx

from app.config import settings

SYSTEM_PROMPT = """You are Routiq, a calm conversational driving-safety assistant for India.

You communicate naturally and briefly because the user is driving.
You are NOT a chatbot interviewer. You do not constantly ask questions.
You respond naturally when the driver initiates conversation.
You can proactively check in only when the safety policy permits it.
Never encourage the driver to interact with a screen while driving.
Never claim to medically diagnose fatigue — talk about observable behaviour
("your responses have slowed") instead of certainty ("you are drowsy").

When driver-state information indicates elevated concern, acknowledge the
evidence without claiming certainty.
Keep responses short enough to be safely heard while driving (1–2 sentences).
If the driver asks about road safety, use the provided road-risk context.
If the driver asks for a safer route, tell them you will check alternatives —
do not invent routes.
If the driver expresses fatigue, prioritize a safe-break recommendation.
If an emergency is indicated, defer to the emergency-response workflow and
keep your reply brief and supportive.
Never start music unless explicit permission has been obtained; if the driver
asks for music, respond conversationally — the permission flow is handled by
the app, not by you.
Speak in the driver's language. If the driver code-switches (e.g. Hinglish),
match their mix naturally. If they ask to switch language, switch and confirm
in the new language.
For casual conversation, behave like a calm, attentive passenger rather than
a formal assistant. Acknowledge, then go quiet. Do not keep the conversation
going unless the driver does.

You may be given:
  DRIVER STATE  — read-only context. You must not create numerical risk
                  scores, override the fatigue engine, or diagnose.
  ROAD CONTEXT  — use it to answer road-safety questions factually.
  RECENT TURNS  — the conversation so far (bounded window).
"""

# Intent vocabulary the model can propose. The app merges this with
# deterministic rules (intent.py) — safety-critical intents always win.
INTENT_PROMPT = """Classify the driver's most recent utterance into EXACTLY ONE of:
EMERGENCY | FATIGUE_DISCLOSURE | SAFETY_QUERY | ROUTE_REQUEST |
MUSIC_REQUEST | LANGUAGE_SWITCH | GENERAL_CONVERSATION

Rules:
- EMERGENCY: crash, accident, need urgent help, medical emergency.
- FATIGUE_DISCLOSURE: tired, sleepy, drowsy, exhausted, can't keep eyes open
  (any language — e.g. "neend aa rahi hai", "thak gaya hoon").
- SAFETY_QUERY: asking about road/route safety, risk, hazards ahead.
- ROUTE_REQUEST: asking for a safer/alternative route or rerouting.
- MUSIC_REQUEST: asking to play music/songs/audio.
- LANGUAGE_SWITCH: asking to change the conversation language.
- GENERAL_CONVERSATION: anything else, including casual chat or status
  answers like "I'm fine".

Reply with ONLY a JSON object: {"intent": "..."}."""


def _redacted(values: dict) -> dict:
    """Never let a key leak into a log/error surface."""
    return {k: ("***" if "key" in k.lower() or "token" in k.lower() else v) for k, v in values.items()}


class GroqConversationService:
    """Thin OpenAI-compatible client for Groq. Rest of Routiq never calls the
    Groq SDK directly — they call this service."""

    def __init__(self) -> None:
        self.url = settings.groq_url
        self.model = settings.groq_chat_model
        self.timeout = settings.groq_timeout

    @property
    def available(self) -> bool:
        return settings.has_groq

    async def _chat(self, messages: list[dict], temperature: float = 0.6, max_tokens: int = 180) -> str | None:
        if not self.available:
            return None
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                resp = await client.post(
                    self.url,
                    headers={"Authorization": f"Bearer {settings.groq_api_key}"},
                    json={
                        "model": self.model,
                        "messages": messages,
                        "temperature": temperature,
                        "max_tokens": max_tokens,
                    },
                )
                resp.raise_for_status()
                data = resp.json()
            return (data.get("choices") or [{}])[0].get("message", {}).get("content", "").strip()
        except Exception as exc:  # noqa: BLE001 — fail soft, fall back to scripted
            # Log WITHOUT the key: only method + error class.
            print(f"[groq] request failed ({type(exc).__name__}) — falling back", flush=True)
            return None

    # -------------------------------------------------------------- reasoning
    async def generate_response(
        self,
        conversation_history: list[dict],
        driver_state: dict[str, Any] | None,
        road_context: dict[str, Any] | None,
        language: str,
        intent: str,
    ) -> str | None:
        """Natural, context-aware reply. Returns None on failure (caller
        falls back to scripted responses)."""
        if not self.available:
            return None
        context_lines: list[str] = []
        if driver_state:
            context_lines.append(
                "DRIVER STATE: state=%s fatigue_risk=%s engagement=%s confidence=%s "
                "recent_delayed_responses=%s silence_detected=%s — informational only, do not diagnose"
                % (
                    driver_state.get("state"),
                    driver_state.get("fatigue_risk"),
                    driver_state.get("engagement"),
                    driver_state.get("confidence"),
                    driver_state.get("recent_delayed_responses"),
                    driver_state.get("silence_detected"),
                )
            )
        if road_context:
            context_lines.append(
                "ROAD CONTEXT: risk=%s score=%s reasons=%s"
                % (
                    road_context.get("overall_risk"),
                    road_context.get("overall_score"),
                    ", ".join(road_context.get("reasons") or []),
                )
            )
        context_lines.append(f"LANGUAGE: {language} — reply in this language.")
        context_lines.append(f"INTENT: {intent}")

        turns = "\n".join(
            f"{'Driver' if m.get('role') == 'user' else 'Routiq'}: {m.get('content', '')}"
            for m in conversation_history[-10:]
        )
        user_msg = "\n".join(context_lines) + f"\n\nRECENT CONVERSATION:\n{turns or '(none yet)'}"
        return await self._chat(
            [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_msg},
            ],
            temperature=0.7,
        )

    # ---------------------------------------------------------------- intent
    async def classify_intent(self, text: str, language: str) -> str | None:
        """Semantic intent via Groq (safety rules in intent.py override this).
        Returns None on failure so the caller can use the deterministic rule."""
        if not self.available or not text.strip():
            return None
        reply = await self._chat(
            [
                {"role": "system", "content": INTENT_PROMPT},
                {
                    "role": "user",
                    "content": f"LANGUAGE: {language}\nDRIVER: {text}",
                },
            ],
            temperature=0.0,
            max_tokens=40,
        )
        if not reply:
            return None
        try:
            start = reply.find("{")
            end = reply.rfind("}")
            if start >= 0 and end > start:
                payload = json.loads(reply[start : end + 1])
                intent = str(payload.get("intent", "")).upper()
                if intent in {
                    "EMERGENCY",
                    "FATIGUE_DISCLOSURE",
                    "SAFETY_QUERY",
                    "ROUTE_REQUEST",
                    "MUSIC_REQUEST",
                    "LANGUAGE_SWITCH",
                    "GENERAL_CONVERSATION",
                }:
                    return intent
        except (json.JSONDecodeError, TypeError, ValueError):
            return None
        return None


# Module-level singleton — main.py imports this.
groq_service = GroqConversationService()
