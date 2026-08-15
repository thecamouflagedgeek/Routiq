"""Deterministic intent classification for Sleep Drive.

Safety-critical transitions are decided by RULES, never by the LLM. If the
driver says "I think I'm falling asleep" or "I've crashed", those MUST map to
FATIGUE_DISCLOSURE / EMERGENCY regardless of what a model proposes.

Priority order (highest wins):
    EMERGENCY > FATIGUE_DISCLOSURE > ROUTE_REQUEST > SAFETY_QUERY
    > MUSIC_REQUEST > LANGUAGE_SWITCH > GENERAL_CONVERSATION

The Groq model proposes a semantic intent; this module overrides it when a
deterministic safety pattern matches, and provides the fallback when the
model is unavailable.
"""
from __future__ import annotations

import re

# ── EMERGENCY ──────────────────────────────────────────────────────────────
EMERGENCY_PATTERNS = [
    r"\bcrashe?d?\b",
    r"\baccident\b",
    r"\bhelp\b",
    r"\bemergency\b",
    r"\bambulance\b",
    r"\b(bleeding|blood)\b",
    r"\b(medical|doctor|hospital)\b.*\b(need|now|quick)",
    r"\b(urgent|serious)\b.*\b(help|problem)",
    # Hindi
    r"\b(help karo|madad karo|bachao)\b",
    r"\b(accident ho gaya|accident ho gaya hai)\b",
    r"\b(emergency hai)\b",
]

# ── FATIGUE_DISCLOSURE ────────────────────────────────────────────────────
FATIGUE_PATTERNS = [
    r"\b(tired|sleepy|drowsy|exhausted|fatigued)\b",
    r"\b(falling|falling)\b.*\b(asleep|sleep)\b",
    r"\bcan'?t (keep|hold) (my )?eyes open\b",
    r"\b(need|want).*\b(rest|break|nap)\b",
    r"\b(so )?tired\b",
    # Hindi / Hinglish
    r"\bneend\b",
    r"\bthak\w*\b",
    r"\baankh\w* (lag|band)\b",
    r"\b(ni?nd)\b",
    # Tamil
    r"\b(surukku|sirukku)\b",
    r"\btired ah\b",
]

# ── ROUTE_REQUEST ─────────────────────────────────────────────────────────
ROUTE_PATTERNS = [
    r"\b(safer|alternative|different|another|better)\b.*\broute\b",
    r"\breroute\b",
    r"\b(change|switch)\b.*\broute\b",
    r"\broute\b.*\b(change|switch)\b",
    r"\bavoid\b.*\b(road|route|area|traffic)\b",
    # Hindi
    r"\b(doosra|dusra|safer)\b.*\b(rasta|road)\b",
]

# ── SAFETY_QUERY ──────────────────────────────────────────────────────────
SAFETY_PATTERNS = [
    r"\b(safe|risky|dangerous|hazard|risk)\b.*\b(road|route|ahead|here|segment|stretch)\b",
    r"\bsafety score\b",
    r"\b(how|what)\b.*\b(safe|risky|risk)\b",
    r"\b(road|route)\b.*\b(risk|danger|hazard)\b",
    r"\b(speed|lighting|traffic)\b.*\b(ahead|here)\b",
    # Hindi
    r"\b(rasta|road|sadak)\b.*\b(risky|safe|khatra)\b",
    r"\bkhatra\b",
]

# ── MUSIC_REQUEST ─────────────────────────────────────────────────────────
MUSIC_PATTERNS = [
    r"\bplay\b.*\b(music|song|songs|something|audio)\b",
    r"\b(music|song)\b.*\b(play|please|chalao|lao)\b",
    r"\bsome music\b",
    # Hindi
    r"\b(gaana|gana|music|song)\b.*\b(chalao|bajao|lao)\b",
]

# ── LANGUAGE_SWITCH ───────────────────────────────────────────────────────
LANGUAGE_PATTERNS = [
    r"\bswitch\b.*\b(?:to|language)\b",
    r"\bspeak\b.*\b(hindi|tamil|telugu|kannada|malayalam|marathi|bengali|gujarati|punjabi|odia|english)\b",
    r"\b(hindi|tamil|telugu|kannada|malayalam|marathi|bengali|gujarati|punjabi|odia|english)\b.*\b(mein|me)\b.*\b(baat|batao|bolo)\b",
    r"\b(baat|batao|bolo)\b.*\b(hindi|tamil|telugu|kannada|malayalam|marathi|bengali|gujarati|punjabi|odia|english)\b.*\b(mein|me)\b",
    r"\btamil (la|il|le)\b",
    r"\benglish please\b",
    r"\bhindi mein\b",
]

# Language mapping used when a language-switch intent is detected.
LANGUAGE_ALIASES: dict[str, str] = {
    "english": "en-IN",
    "hindi": "hi-IN",
    "tamil": "ta-IN",
    "telugu": "te-IN",
    "kannada": "kn-IN",
    "malayalam": "ml-IN",
    "marathi": "mr-IN",
    "bengali": "bn-IN",
    "gujarati": "gu-IN",
    "punjabi": "pa-IN",
    "odia": "od-IN",
}


def _any(patterns: list[str], text: str) -> bool:
    lowered = text.lower()
    return any(re.search(p, lowered) for p in patterns)


def target_language_for(text: str) -> str | None:
    """If this utterance is a language switch, return the target BCP-47 code."""
    lowered = text.lower()
    for alias, code in LANGUAGE_ALIASES.items():
        # "switch to X", "speak X", "X mein baat", "X la/il/le"
        if re.search(rf"\b(switch|speak|talk|bolo|batao|baat)\b.*\b{alias}\b", lowered) or re.search(
            rf"\b{alias}\b.*\b(mein|me|la|il|le|please)\b", lowered
        ):
            return code
    return None


def classify_intent(text: str) -> str:
    """Deterministic classification — the safety backstop. Priority order:
    EMERGENCY > FATIGUE_DISCLOSURE > ROUTE_REQUEST > SAFETY_QUERY >
    MUSIC_REQUEST > LANGUAGE_SWITCH > GENERAL_CONVERSATION."""
    if not text or not text.strip():
        return "GENERAL_CONVERSATION"
    t = text.strip()
    if _any(EMERGENCY_PATTERNS, t):
        return "EMERGENCY"
    if _any(FATIGUE_PATTERNS, t):
        return "FATIGUE_DISCLOSURE"
    if _any(ROUTE_PATTERNS, t):
        return "ROUTE_REQUEST"
    if _any(SAFETY_PATTERNS, t):
        return "SAFETY_QUERY"
    if _any(MUSIC_PATTERNS, t):
        return "MUSIC_REQUEST"
    if _any(LANGUAGE_PATTERNS, t) or target_language_for(t):
        return "LANGUAGE_SWITCH"
    return "GENERAL_CONVERSATION"


def merge_intent(model_intent: str | None, text: str) -> str:
    """Safety rules always win over the model."""
    deterministic = classify_intent(text)
    if deterministic in ("EMERGENCY", "FATIGUE_DISCLOSURE"):
        return deterministic
    if model_intent and model_intent in {
        "EMERGENCY",
        "FATIGUE_DISCLOSURE",
        "SAFETY_QUERY",
        "ROUTE_REQUEST",
        "MUSIC_REQUEST",
        "LANGUAGE_SWITCH",
        "GENERAL_CONVERSATION",
    }:
        return model_intent
    return deterministic
