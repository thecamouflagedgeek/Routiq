"""Sleep Drive — conversational driver-engagement engine.

The product loop:

    SENSE        listen to the driver (audio / conversation events)
    UNDERSTAND   measure response behaviour against a PERSONAL rolling baseline
    PREDICT      temporally aggregate signals into a reduced-engagement /
                 fatigue risk estimate (never a medical diagnosis)
    EXPLAIN      produce human-readable evidence behind every state
    ACT          escalate naturally, respect cooldowns, recommend a safe break
    LEARN        keep updating the driver's interaction baseline

Design rules (non-negotiable):

- EVENT-DRIVEN. The engine consumes a stream of events (prompt_issued,
  response_received, silence_timeout, microphone_error, ...) and derives the
  driver-state estimate. Every transition is logged for auditability.
- PERSONAL BASELINE. Latency is judged against the driver's own rolling
  median, not a universal threshold. With insufficient baseline the estimate
  stays conservative.
- TEMPORAL, not one-shot. A single response never decides anything; risk is
  an exponentially-decaying accumulator with hysteresis so state does not
  flap LOW -> HIGH -> LOW.
- RISK != CONFIDENCE. High risk with low confidence (few samples, bad mic) is
  a real state, not a contradiction.
- FAIL-SAFE. Microphone / ASR / audio failures NEVER raise risk. Only genuine
  unexplained non-response (healthy mic + silence_timeout) counts.
- NO MEDICAL CLAIMS. This estimates "possible fatigue / reduced engagement".
"""
from __future__ import annotations

import math
import random
import statistics
import time
import uuid
from datetime import datetime, timezone

from app.config import FatigueThresholds
from app.models import (
    DriverState,
    FatigueEvent,
    FatigueSession,
    InteractionRecord,
    LogEntry,
)

RISK_BANDS = ["NORMAL", "ATTENTION", "ELEVATED", "HIGH_CONCERN"]
_BAND_INDEX = {name: i for i, name in enumerate(RISK_BANDS)}

# Conversational pool — friendly, brief, never a checklist. Large enough
# that a normal drive never hears the same check-in twice; selection is
# randomized away from recently-used prompts (see next_prompt).
QUESTION_POOL = [
    "How's the drive going?",
    "Anything interesting on the road ahead?",
    "What road are we on right now?",
    "Quick check — how are you feeling?",
    "Want me to play something for you?",
    "How's the traffic treating you?",
    "Long stretch ahead — doing okay?",
    "What was the last turn you took?",
    "Need a break soon?",
    "How are the eyes doing?",
    "Everything steady on your end?",
    "How long have we been driving now?",
    "Any spots up ahead I should keep an eye on?",
    "Feeling more awake now or less?",
    "What's the next landmark you expect to see?",
    "Warm in here — should I suggest a stop for air?",
    "How's the car handling?",
    "Are we close to where you wanted to stop?",
    "Want me to keep you company for a bit?",
    "What's the plan once we reach the destination?",
    "Anything on your mind — road or otherwise?",
    "How's the visibility up there?",
    "Should I check for a better route ahead?",
    "You've been quiet a while — still with me?",
]

CHECKIN_VARIANTS: dict[str, list[str]] = {
    "ATTENTION": [
        "Hey, you doing okay? Just checking in.",
        "You seem a little quiet — everything alright up there?",
        "You've been quiet for a few minutes — all good?",
        "Quick check: still with me?",
    ],
    "ELEVATED": [
        "You've been a little quiet. Hey, are you still with me?",
        "A couple of those replies were slow. Want me to help you find a place to stop?",
        "Your replies have slowed — how are you feeling right now?",
        "Let's take stock: are you okay to keep driving, or should we plan a stop?",
    ],
    "HIGH_CONCERN": [
        "Your responses have slowed significantly. If you're feeling tired, "
        "please consider stopping somewhere safe for a break.",
        "I'm concerned about the way your responses have slowed. Please find a "
        "safe place to pull over and rest.",
    ],
}

CRITICAL_MESSAGE = (
    "Possible fatigue or reduced engagement detected. Please pull over at the "
    "next safe location as soon as it is safe to do so."
)


def utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _clamp(value: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, value))


class PersonalBaseline:
    """Rolling median of recent response latencies (ms).

    The median is robust to outliers — one very slow response does not
    corrupt the driver's "normal". The window is the driver's own recent
    behaviour, so the estimate adapts as the session evolves.
    """

    def __init__(self, window: int, min_samples: int, floor_ms: float) -> None:
        self.window = window
        self.min_samples = min_samples
        self.floor_ms = floor_ms
        self.samples: list[float] = []

    def add(self, latency_ms: float) -> None:
        self.samples.append(latency_ms)
        if len(self.samples) > self.window:
            self.samples.pop(0)

    @property
    def trusted(self) -> bool:
        return len(self.samples) >= self.min_samples

    @property
    def size(self) -> int:
        return len(self.samples)

    @property
    def median_ms(self) -> float | None:
        if not self.samples:
            return None
        return statistics.median(self.samples)

    def ratio(self, latency_ms: float) -> float | None:
        median = self.median_ms
        if median is None:
            return None
        return latency_ms / max(median, self.floor_ms)


class FatigueEngine:
    """Holds sessions in memory; all state transitions are deterministic."""

    def __init__(self, default_language: str = "en-IN") -> None:
        self._sessions: dict[str, FatigueSession] = {}
        self._baselines: dict[str, PersonalBaseline] = {}
        self._last_event_at: dict[str, float] = {}
        self._adverse_streak: dict[str, int] = {}
        self._good_streak: dict[str, int] = {}
        # recently asked prompts per session — the picker avoids repeating them
        self._asked: dict[str, list[str]] = {}
        self._default_language = default_language

    # ------------------------------------------------------------------ setup
    # Production hygiene: sessions are in-memory; bound the store and evict
    # the stalest session first so a long-running process cannot leak memory.
    MAX_SESSIONS = 100

    def _evict_if_needed(self) -> None:
        if len(self._sessions) < self.MAX_SESSIONS:
            return
        if not self._last_event_at:
            return
        stalest = min(self._last_event_at, key=self._last_event_at.get)
        for store in (
            self._sessions,
            self._baselines,
            self._last_event_at,
            self._adverse_streak,
            self._good_streak,
            self._asked,
        ):
            store.pop(stalest, None)

    def create_session(
        self,
        driver_name: str = "",
        mode: str = "live",
        thresholds: dict | None = None,
        language: str | None = None,
    ) -> FatigueSession:
        self._evict_if_needed()
        sid = uuid.uuid4().hex[:12]
        session = FatigueSession(
            session_id=sid,
            driver_name=driver_name,
            mode="demo" if mode == "demo" else "live",
            language=self._default_language,
            # fresh estimate: slightly conservative, never "100% engaged"
            fatigue_risk=0.06,
            engagement=0.94,
            message="Session ready. Sleep Drive is monitoring.",
        )
        if thresholds:
            session.thresholds = thresholds
        if language:
            session.language = language
        self._sessions[sid] = session
        t = self._thresholds(session)
        self._baselines[sid] = PersonalBaseline(
            window=int(t.baseline_window),
            min_samples=int(t.min_baseline_samples),
            floor_ms=t.min_baseline_seconds * 1000.0,
        )
        self._last_event_at[sid] = time.time()
        self._adverse_streak[sid] = 0
        self._good_streak[sid] = 0
        self._log(session, "session_started", "Session started — monitoring.")
        return session

    def get(self, session_id: str) -> FatigueSession | None:
        return self._sessions.get(session_id)

    @property
    def session_count(self) -> int:
        return len(self._sessions)

    def _thresholds(self, session: FatigueSession) -> FatigueThresholds:
        merged = FatigueThresholds().as_dict()
        if session.thresholds:
            merged.update(
                {k: v for k, v in session.thresholds.items() if k in merged}
            )
        return FatigueThresholds(**merged)

    def _baseline(self, session_id: str) -> PersonalBaseline:
        return self._baselines[session_id]

    # ------------------------------------------------------------------ log
    def _log(self, session: FatigueSession, event_type: str, summary: str) -> None:
        session.events.append(LogEntry(event_type=event_type, summary=summary))
        if len(session.events) > 200:  # ring buffer
            session.events = session.events[-200:]

    # ----------------------------------------------------------------- events
    def handle_event(self, event: FatigueEvent, now: float | None = None) -> DriverState | None:
        session = self._sessions.get(event.session_id)
        if session is None:
            return None
        now = now if now is not None else time.time()
        t = event.event_type

        if t == "prompt_issued":
            self._on_prompt(session, event, now)
        elif t == "speech_started":
            self._log(session, "speech_started", "Speech detected — measuring response.")
        elif t == "speech_ended":
            self._log(session, "speech_ended", "Speech ended.")
        elif t == "response_received":
            self._on_response(session, event, now)
        elif t == "driver_initiated":
            self._on_driver_initiated(session, event)
        elif t == "silence_timeout":
            self._on_silence(session, event, now)
        elif t in ("microphone_error", "audio_failure", "asr_error"):
            self._on_audio_failure(session, event)
        elif t == "intervention_triggered":
            self._on_intervention(session, event)
        elif t == "state_changed":
            self._log(session, "state_changed", event.transcript or "state transition acknowledged")
        elif t == "intent_detected":
            session.last_intent = event.intent or event.transcript or ""
            self._log(session, "intent_detected", f"Intent: {session.last_intent}")
        elif t == "language_detected":
            if event.language:
                session.language = event.language
            self._log(session, "language_detected", f"Detected language: {event.language or 'unknown'}")
        elif t == "language_changed":
            if event.language:
                session.language = event.language
            self._log(session, "language_changed", f"Conversation language → {session.language}")
        elif t == "ai_response_generated":
            self._log(session, "ai_response_generated", "AI reply generated for driver turn.")
        elif t in ("tts_started", "tts_finished", "tts_interrupted"):
            label = t.replace("tts_", "").capitalize()
            self._log(session, t, f"TTS {label}.")
        elif t in ("music_permission_requested", "music_permission_granted", "music_permission_denied"):
            label = t.replace("music_permission_", "").capitalize()
            self._log(session, t, f"Music permission {label}.")
        elif t == "music_started":
            self._log(session, "music_started", "Music started (with explicit consent).")
        elif t == "music_stopped":
            self._log(session, "music_stopped", "Music stopped.")
        elif t == "reset":
            self._on_reset(session)

        self._last_event_at[session.session_id] = now
        return self.snapshot(session)

    # ----------------------------------------------------------- prompt turn
    def _on_prompt(self, session: FatigueSession, event: FatigueEvent, now: float) -> None:
        session.conversation_state = "WAITING_FOR_RESPONSE"
        session.questions_asked += 1
        session.last_question = event.transcript or "How's the drive going?"
        session.last_prompt_at = utcnow_iso()
        # Cooldown until the next prompt may be issued, based on how much
        # concern the CURRENT state carries (a considerate passenger paces
        # themselves).
        session.next_prompt_allowed_at = utcnow_iso()  # placeholder replaced below
        cooldown = self._cooldown_for(session, self._thresholds(session))
        session.next_prompt_allowed_at = self._iso(now + cooldown)
        self._log(
            session,
            "prompt_issued",
            f"Prompt issued: \"{session.last_question}\" (next prompt ≥ {cooldown:.0f}s)",
        )

    # ----------------------------------------------------------- responses
    def _on_response(self, session: FatigueSession, event: FatigueEvent, now: float) -> None:
        thresholds = self._thresholds(session)
        baseline = self._baseline(session.session_id)
        latency_ms = event.latency_ms

        # A real response proves the audio path works.
        if not session.audio_healthy:
            session.audio_healthy = True
            session.last_mic_error = None
            self._log(session, "state_changed", "Audio path healthy again — response received.")

        score, band, extra_evidence = self._score_response(
            latency_ms, baseline, thresholds
        )

        if latency_ms is not None:
            # Only responses close to the driver's usual pace update the
            # personal baseline — otherwise the "normal" would drift upward
            # with the very slowdown we are trying to detect.
            if score <= thresholds.baseline_max_score:
                baseline.add(latency_ms)
            session.baseline_latency_ms = baseline.median_ms
            session.baseline_samples = baseline.size
            session.response_latency_ms = latency_ms
            session.silence_detected = False
        session.conversation_state = "ANALYZING"

        # per-turn interaction record (timing metadata, kept for auditability)
        record = InteractionRecord(
            prompt_id=event.prompt_id or uuid.uuid4().hex[:8],
            latency_ms=latency_ms,
            response_present=True,
            response_length=len(event.transcript or "") or None,
            band=band,
        )
        session.interactions.append(record)
        if len(session.interactions) > 20:
            session.interactions = session.interactions[-20:]

        self._apply_signal(session, score, now, thresholds, adverse=score >= 0.35)

        if score >= 0.35:
            session.slow_responses += 1
        else:
            session.slow_responses = max(0, session.slow_responses - 1)

        session.message = self._band_message(band, score, baseline, latency_ms)

        self._finalize(session, now, thresholds, extra_evidence=extra_evidence)
        self._log(
            session,
            "response_received",
            f"Response received — latency {latency_ms/1000.0 if latency_ms is not None else 'n/a'}s, "
            f"band {band}, score {score:.2f}",
        )

    def _on_silence(self, session: FatigueSession, event: FatigueEvent, now: float) -> None:
        thresholds = self._thresholds(session)
        session.conversation_state = "ANALYZING"
        session.silence_detected = True
        session.missed_responses += 1

        if not session.audio_healthy:
            # Microphone failure must NEVER be interpreted as fatigue.
            session.message = (
                "No response detected — but the microphone is unavailable, so "
                "this does not count toward fatigue."
            )
            self._log(
                session,
                "silence_timeout",
                "Silence detected with an unhealthy microphone — risk NOT increased.",
            )
            self._finalize(session, now, thresholds, from_silence=False)
            return

        self._log(
            session,
            "silence_timeout",
            "No response within the wait window (healthy microphone) — genuine non-response.",
        )
        prior_risk = session.fatigue_risk
        self._apply_signal(session, 1.0, now, thresholds, adverse=True)
        self._finalize(
            session, now, thresholds, from_silence=True, prior_risk=prior_risk
        )
        session.message = (
            "No response detected. If you're feeling tired, consider pulling "
            "over somewhere safe for a break."
        )

    def _on_driver_initiated(self, session: FatigueSession, event: FatigueEvent) -> None:
        """The driver spoke first (no prompt pending). This is an ENGAGEMENT
        signal — it proves the audio path works and that the driver is with
        us, so it never raises risk."""
        session.driver_initiated_count += 1
        session.silence_detected = False
        session.conversation_state = "WAITING_FOR_USER"
        if not session.audio_healthy:
            session.audio_healthy = True
            session.last_mic_error = None
            self._log(session, "state_changed", "Audio path healthy again — driver spoke first.")
        summary = event.transcript or "(no transcript)"
        self._log(session, "driver_initiated", f"Driver initiated: \"{summary}\"")
        session.message = "Driver spoke first — noted, staying attentive."

    def _on_audio_failure(self, session: FatigueSession, event: FatigueEvent) -> None:
        session.audio_healthy = False
        session.last_mic_error = event.error_code or event.event_type
        # Failure NEVER raises risk; it lowers confidence instead.
        session.confidence = round(_clamp(session.confidence * 0.5), 2)
        label = {
            "microphone_error": "Microphone unavailable",
            "audio_failure": "Audio stream failure",
            "asr_error": "Speech recognition failure",
        }.get(event.event_type, "Audio failure")
        session.message = (
            f"{label} — this does not affect your fatigue estimate. "
            "No response will be counted while the mic is unavailable."
        )
        if label not in session.evidence:
            session.evidence = [label + " — risk not increased"] + [
                e for e in session.evidence if e != label + " — risk not increased"
            ]
        self._log(session, event.event_type, f"{label} — risk NOT increased, confidence lowered.")

    def _on_intervention(self, session: FatigueSession, event: FatigueEvent) -> None:
        session.interventions_triggered += 1
        session.conversation_state = "INTERVENTION"
        if event.transcript:
            session.message = event.transcript
        self._log(
            session,
            "intervention_triggered",
            event.transcript or f"Intervention #{session.interventions_triggered}",
        )

    def _on_reset(self, session: FatigueSession) -> None:
        session.state = "NORMAL"
        session.conversation_state = "CHECK_IN"
        session.fatigue_risk = 0.06
        session.engagement = 0.94
        session.confidence = self._confidence(session)
        session.slow_responses = 0
        session.missed_responses = 0
        session.recent_delayed_responses = 0
        session.silence_detected = False
        session.response_latency_ms = None
        session.evidence = ["Session reset — monitoring resumed."]
        session.state_reason = "Manual reset (driver confirmed awake)."
        session.message = "Sleep Drive reset. Monitoring resumed."
        # the personal baseline is deliberately KEPT across resets
        self._adverse_streak[session.session_id] = 0
        self._good_streak[session.session_id] = 0
        self._log(session, "reset", "Session reset — baseline retained.")

    # ------------------------------------------------------------- risk math
    def _score_response(
        self,
        latency_ms: float | None,
        baseline: PersonalBaseline,
        thresholds: FatigueThresholds,
    ) -> tuple[float, str, list[str]]:
        """Map one response onto a 0..1 signal + band + supporting evidence.

        Absolute floors always apply; once the personal baseline is trusted,
        relative deviation is the stronger signal (e.g. 2.7x your own norm).
        """
        if latency_ms is None:
            return 0.0, "NORMAL", []
        seconds = latency_ms / 1000.0
        abs_band = thresholds.latency_band(seconds)
        extra: list[str] = []

        if abs_band == "SEVERE":
            return 0.85, "SEVERE", [f"response latency {seconds:.1f}s exceeds safe window"]
        if abs_band == "ELEVATED":
            return 0.7, "ELEVATED", [f"response latency {seconds:.1f}s well above normal"]
        if abs_band == "MILD":
            return 0.5, "MILD", [f"response latency {seconds:.1f}s noticeably slower"]

        # Absolute-normal, but possibly slow for THIS driver.
        if baseline.trusted:
            ratio = baseline.ratio(latency_ms)
            if ratio is not None and ratio >= thresholds.severe_ratio:
                extra.append(f"response {ratio:.1f}× slower than personal baseline")
                return 0.85, "SEVERE", extra
            if ratio is not None and ratio >= thresholds.slow_ratio:
                extra.append(f"response {ratio:.1f}× slower than personal baseline")
                return 0.6, "ELEVATED", extra
        return 0.0, "NORMAL", []

    def _apply_signal(
        self,
        session: FatigueSession,
        score: float,
        now: float,
        thresholds: FatigueThresholds,
        adverse: bool,
    ) -> None:
        """EMA update with time decay — the temporal aggregation step."""
        prev = session.fatigue_risk
        dt = max(0.0, now - self._last_event_at.get(session.session_id, now))
        prev *= math.exp(-dt / thresholds.risk_decay_seconds)

        # Asymmetric smoothing: silence is strong, ordinary adverse signals
        # accumulate gently, and good responses recover at a moderate pace.
        # The low k for adverse signals is what keeps a single delay from
        # flinging the estimate to HIGH_CONCERN.
        k = 0.8 if score >= 0.8 else (0.3 if adverse else 0.4)
        new_risk = prev + k * (score - prev)
        # floor: never claim perfect engagement
        session.fatigue_risk = round(_clamp(new_risk, 0.05, 1.0), 3)
        session.engagement = round(_clamp(1.0 - session.fatigue_risk, 0.0, 1.0), 3)

        if adverse:
            self._adverse_streak[session.session_id] += 1
            self._good_streak[session.session_id] = 0
        else:
            self._good_streak[session.session_id] += 1
            self._adverse_streak[session.session_id] = 0

    def _finalize(
        self,
        session: FatigueSession,
        now: float,
        thresholds: FatigueThresholds,
        extra_evidence: list[str] | None = None,
        from_silence: bool = False,
        prior_risk: float | None = None,
    ) -> None:
        """Recompute state (with hysteresis), evidence, and counters."""
        prev = session.state
        risk = session.fatigue_risk
        baseline = self._baseline(session.session_id)
        sid = session.session_id

        # --- state mapping ------------------------------------------------
        # Silence with a healthy mic is the strongest signal: a prolonged,
        # unexplained non-response after observed degradation is high concern.
        # Conservative guard: a FIRST silence on a fresh session (no baseline,
        # no prior adverse history) only reaches ELEVATED — we don't yet know
        # this driver's norm, so we stay cautious rather than alarmed.
        if from_silence:
            strong_silence = (
                baseline.trusted
                or (prior_risk is not None and prior_risk >= 0.30)
                or session.missed_responses >= 2
            )
            new = "HIGH_CONCERN" if (strong_silence and risk >= 0.55) else "ELEVATED"
        elif risk >= thresholds.risk_high:
            new = "HIGH_CONCERN"
        elif risk >= thresholds.risk_elevated:
            new = "ELEVATED"
        elif risk >= thresholds.risk_attention:
            new = "ATTENTION"
        else:
            new = "NORMAL"

        # Conservative guard: without a trusted baseline, timing alone can
        # only reach ATTENTION (we don't know this driver's norm yet).
        if not baseline.trusted and not from_silence:
            if _BAND_INDEX[new] > _BAND_INDEX["ATTENTION"]:
                new = "ATTENTION"

        # Hysteresis: do not let a single blip pull a HIGH_CONCERN session
        # straight back to NORMAL — the EMA already decays gradually, but
        # also cap how many levels can drop per interaction.
        if _BAND_INDEX[new] < _BAND_INDEX[prev] - 1:
            new = RISK_BANDS[_BAND_INDEX[prev] - 1]

        # --- recent delayed responses (last baseline window) --------------
        recent = 0
        for rec in session.interactions[-int(thresholds.baseline_window):]:
            if rec.band != "NORMAL" or not rec.response_present:
                recent += 1
        session.recent_delayed_responses = recent

        # --- evidence -------------------------------------------------------
        evidence: list[str] = []
        if from_silence and session.audio_healthy:
            evidence.append("prolonged silence — no response detected")
        if session.response_latency_ms is not None and baseline.trusted:
            ratio = baseline.ratio(session.response_latency_ms)
            if ratio is not None and ratio >= thresholds.slow_ratio:
                evidence.append(f"response {ratio:.1f}× slower than personal baseline")
        if recent >= 2:
            evidence.append("repeated delayed responses")
        if not baseline.trusted:
            evidence.append("insufficient baseline data — estimates are conservative")
        if not session.audio_healthy:
            evidence.append("microphone unavailable — risk not increased")
        if session.confidence < 0.4:
            evidence.append("low confidence in estimate")
        if extra_evidence:
            for e in extra_evidence:
                if e not in evidence:
                    evidence.append(e)
        if new == "NORMAL" and session.fatigue_risk <= 0.12:
            evidence.append("responses consistent with personal baseline")
        if _BAND_INDEX[new] < _BAND_INDEX[prev]:
            evidence.append("engagement improving — continuing to monitor")
        session.evidence = evidence[:5]

        session.state = new
        session.conversation_state = "INTERVENTION" if new == "HIGH_CONCERN" else session.conversation_state
        session.confidence = self._confidence(session)
        session.state_reason = self._reason(prev, new, risk, baseline, from_silence)

        if new != prev:
            self._log(
                session,
                "state_changed",
                f"State: {prev} → {new} | Reason: {session.state_reason}",
            )
            if _BAND_INDEX[new] >= _BAND_INDEX["ELEVATED"]:
                session.interventions_triggered += 1
                note = (
                    "stop recommendation issued"
                    if new == "HIGH_CONCERN"
                    else "considerate check-in scheduled"
                )
                self._log(
                    session,
                    "intervention_triggered",
                    f"Escalation to {new} — {note}.",
                )

    def _confidence(self, session: FatigueSession) -> float:
        baseline = self._baseline(session.session_id)
        base = 0.25 + 0.12 * min(baseline.size, 5)
        if not session.audio_healthy:
            base *= 0.5
        return round(_clamp(base, 0.05, 0.95), 2)

    @staticmethod
    def _reason(
        prev: str,
        new: str,
        risk: float,
        baseline: PersonalBaseline,
        from_silence: bool,
    ) -> str:
        if prev == new:
            return "risk estimate updated (smoothed)"
        if from_silence:
            return "unexplained prolonged non-response (healthy microphone)"
        if _BAND_INDEX[new] > _BAND_INDEX[prev]:
            return (
                f"temporal risk rose to {risk:.2f} with {baseline.size} baseline "
                "sample(s)"
            )
        return f"repeated good responses — risk fell to {risk:.2f}"

    @staticmethod
    def _band_message(
        band: str, score: float, baseline: PersonalBaseline, latency_ms: float | None
    ) -> str:
        if score >= 0.8:
            return "Response was substantially slower than your normal pattern. Stay with me."
        if band == "ELEVATED":
            return "Response was noticeably delayed. I want to make sure you're okay."
        if band == "MILD":
            return "Slightly slower response than usual — checking in."
        if latency_ms is not None and baseline.trusted and baseline.ratio(latency_ms) and baseline.ratio(latency_ms) >= 1.5:
            return "That was slower than your usual pace — everything alright?"
        return "Response looks good — continuing to monitor."

    # ------------------------------------------------------------- cooldowns
    # Risk-adaptive pacing: healthy drivers get long quiet periods, intervals
    # shorten as the estimate worsens. The client additionally randomizes the
    # healthy interval within its min/max range so check-ins never feel
    # mechanically scheduled.
    @staticmethod
    def _cooldown_for(session: FatigueSession, thresholds: FatigueThresholds) -> float:
        return {
            "NORMAL": thresholds.healthy_min_prompt_interval,
            "ATTENTION": thresholds.attention_prompt_interval,
            "ELEVATED": thresholds.elevated_prompt_interval,
            "HIGH_CONCERN": thresholds.critical_prompt_interval,
        }.get(session.state, thresholds.healthy_min_prompt_interval)

    @staticmethod
    def _iso(epoch: float) -> str:
        return datetime.fromtimestamp(epoch, tz=timezone.utc).isoformat(timespec="seconds")

    # ------------------------------------------------------------ next prompt
    def next_prompt(self, session: FatigueSession) -> str:
        """Pick the next check-in: a random prompt from the state-appropriate
        pool, avoiding anything asked recently so a drive never feels scripted.
        Falls back to any pool member once the recent window is exhausted."""
        state = session.state
        pool = CHECKIN_VARIANTS.get(state) or QUESTION_POOL
        recent = self._asked.get(session.session_id, [])
        usable = [p for p in pool if p not in recent] or pool
        candidate = random.choice(usable)
        if candidate == session.last_question and len(usable) > 1:
            others = [p for p in usable if p != session.last_question]
            if others:
                candidate = random.choice(others)
        self._asked[session.session_id] = (recent + [candidate])[-6:]
        return candidate

    def critical_message(self) -> str:
        return CRITICAL_MESSAGE

    # ------------------------------------------------------------- snapshot
    def snapshot(self, session: FatigueSession) -> DriverState:
        now = time.time()
        cooldown_remaining = 0.0
        if session.next_prompt_allowed_at:
            try:
                allowed = datetime.fromisoformat(session.next_prompt_allowed_at).timestamp()
                cooldown_remaining = max(0.0, allowed - now)
            except ValueError:
                cooldown_remaining = 0.0
        return DriverState(
            session_id=session.session_id,
            mode=session.mode,
            state=session.state,
            fatigue_risk=session.fatigue_risk,
            engagement=session.engagement,
            confidence=session.confidence,
            response_latency_ms=session.response_latency_ms,
            silence_detected=session.silence_detected,
            recent_delayed_responses=session.recent_delayed_responses,
            slow_responses=session.slow_responses,
            missed_responses=session.missed_responses,
            baseline_latency_ms=session.baseline_latency_ms,
            baseline_samples=session.baseline_samples,
            last_interaction_at=session.interactions[-1].timestamp
            if session.interactions else None,
            evidence=session.evidence,
            conversation_state=session.conversation_state,
            last_question=session.last_question,
            language=session.language,
            last_intent=session.last_intent,
            driver_initiated_count=session.driver_initiated_count,
            message=session.message,
            audio_healthy=session.audio_healthy,
            cooldown_remaining_s=round(cooldown_remaining, 1),
            interventions_triggered=session.interventions_triggered,
            questions_asked=session.questions_asked,
            recent_log=session.events[-8:],
        )
