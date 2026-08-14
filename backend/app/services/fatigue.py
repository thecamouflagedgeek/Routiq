"""Conversational fatigue detection state machine.

The client measures response latency locally (speech APIs are browser-side)
and streams events here; the server owns the state machine and escalation
logic so behavior is consistent and auditable.

States: NORMAL -> QUESTION -> WAITING_FOR_RESPONSE -> ANALYZE_RESPONSE
         -> NORMAL / CAUTION / ESCALATE

Escalation levels:
    0 normal conversation
    1 mild concern  -> follow-up question, subtle warning
    2 elevated      -> direct "still with me?" check, stronger warning
    3 critical      -> strong alert, recommend stopping, emergency controls

This is an experimental prototype — it cannot diagnose medical fatigue.
"""
from __future__ import annotations

import uuid

from app.config import FatigueThresholds
from app.models import FatigueEvent, FatigueSession, FatigueState

QUESTIONS = [
    "How's the drive going?",
    "Quick check — what was the last turn you took?",
    "Want me to play something for you?",
    "You still with me?",
    "What road are we on right now?",
    "How are you feeling — need a break soon?",
]

QUESTION_POOL = QUESTIONS[:-2]  # normal rotation
CHECKIN_QUESTIONS = [
    "You seem quiet — everything okay up there?",
    "Hey, you still with me?",
    "I didn't catch that — are you with me?",
]

CRITICAL_MESSAGE = (
    "Possible fatigue detected. Please pull over at the next safe location "
    "as soon as it is safe to do so."
)


class FatigueEngine:
    """Holds sessions in memory; state transitions are deterministic."""

    def __init__(self) -> None:
        self._sessions: dict[str, FatigueSession] = {}

    def create_session(self, driver_name: str = "",
                       thresholds: dict | None = None) -> FatigueSession:
        sid = uuid.uuid4().hex[:12]
        session = FatigueSession(session_id=sid, driver_name=driver_name)
        if thresholds:
            self._apply_thresholds(session, thresholds)
        self._sessions[sid] = session
        return session

    def get(self, session_id: str) -> FatigueSession | None:
        return self._sessions.get(session_id)

    def _apply_thresholds(self, session: FatigueSession, thresholds: dict) -> None:
        session.thresholds = thresholds
        session.message = "Session ready. Sleep Drive is monitoring."

    @staticmethod
    def _thresholds(session: FatigueSession) -> FatigueThresholds:
        if not session.thresholds:
            return FatigueThresholds()
        merged = FatigueThresholds().as_dict()
        merged.update({k: v for k, v in session.thresholds.items() if k in merged})
        return FatigueThresholds(**merged)

    # ------------------------------------------------------------------ events
    def handle_event(self, event: FatigueEvent) -> FatigueState | None:
        session = self._sessions.get(event.session_id)
        if session is None:
            return None

        t = event.event_type
        if t == "question_asked":
            session.state = "QUESTION"
            session.questions_asked += 1
            session.last_question = event.transcript or "How's the drive going?"
            session.message = "Question asked — listening for a response."
        elif t == "response":
            self._analyze(session, event)
        elif t in ("no_response", "timeout"):
            self._miss(session, event)
        elif t == "reset":
            self._reset(session)
            return self.snapshot(session)

        return self.snapshot(session)

    def _analyze(self, session: FatigueSession, event: FatigueEvent) -> None:
        latency = event.latency_seconds
        session.state = "ANALYZE_RESPONSE"
        thresholds = self._thresholds(session)
        band = thresholds.latency_band(latency) if latency is not None else "NORMAL"
        if latency is None:
            band = "NORMAL"

        # Signal 2: presence — a response arrived, so clear one miss
        session.missed_responses = max(0, session.missed_responses - 1)

        # Signal 1: latency + Signal 3: unusually short response
        short = (event.response_duration is not None
                 and event.response_duration < thresholds.min_response_duration
                 and latency is not None and latency > thresholds.normal_max)
        if band in ("MILD", "ELEVATED", "SEVERE"):
            session.slow_responses += 1
        elif short:
            session.slow_responses += 1
        else:
            # a good response nudges the counters back down
            session.slow_responses = max(0, session.slow_responses - 1)

        self._recompute(session)
        if session.escalation_level >= 2:
            session.state = "ESCALATE"
        elif session.escalation_level >= 1 or band != "NORMAL":
            session.state = "CAUTION"
        else:
            session.state = "NORMAL"
        session.message = self._band_message(band)

    def _miss(self, session: FatigueSession, event: FatigueEvent) -> None:
        session.state = "WAITING_FOR_RESPONSE"
        session.missed_responses += 1
        self._recompute(session)
        session.state = "ESCALATE" if session.escalation_level >= 2 else "CAUTION"
        if session.escalation_level >= 3:
            session.message = CRITICAL_MESSAGE
        elif session.escalation_level == 2:
            session.message = "Hey, you still with me? I'm getting worried."
        else:
            session.message = "No response detected. Checking in again shortly."

    def _recompute(self, session: FatigueSession) -> None:
        severity = session.slow_responses + 2 * session.missed_responses
        if severity == 0:
            session.escalation_level = 0
        elif severity == 1:
            session.escalation_level = 1
        elif severity in (2, 3):
            session.escalation_level = 2
        else:
            session.escalation_level = 3
        session.fatigue_confidence = self._confidence(session)

    @staticmethod
    def _confidence(session: FatigueSession) -> float:
        base = session.slow_responses * 14 + session.missed_responses * 22
        if session.escalation_level == 3:
            base += 20
        return round(min(96.0, base), 0)

    @staticmethod
    def _band_message(band: str) -> str:
        return {
            "NORMAL": "Response looks good — continuing to monitor.",
            "MILD": "Slightly delayed response. Checking in with you.",
            "ELEVATED": "Response was noticeably delayed. Stay with me.",
            "SEVERE": "Possible fatigue detected. Please consider a break.",
        }.get(band, "Response analyzed.")

    def _reset(self, session: FatigueSession) -> None:
        session.state = "NORMAL"
        session.escalation_level = 0
        session.fatigue_confidence = 0.0
        session.slow_responses = 0
        session.missed_responses = 0
        session.message = "Sleep Drive reset. Monitoring resumed."

    def snapshot(self, session: FatigueSession) -> FatigueState:
        return FatigueState(
            session_id=session.session_id,
            state=session.state,
            escalation_level=session.escalation_level,
            fatigue_confidence=session.fatigue_confidence,
            slow_responses=session.slow_responses,
            missed_responses=session.missed_responses,
            questions_asked=session.questions_asked,
            last_question=session.last_question,
            message=session.message,
        )

    def next_question(self, session: FatigueSession) -> str:
        if session.escalation_level == 1:
            return CHECKIN_QUESTIONS[0]
        if session.escalation_level == 2:
            return CHECKIN_QUESTIONS[1]
        if session.escalation_level == 3:
            return "I need you to pull over now. Are you able to stop safely?"
        idx = session.questions_asked % len(QUESTION_POOL)
        return QUESTION_POOL[idx]
