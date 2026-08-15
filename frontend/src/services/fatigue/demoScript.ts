/**
 * Deterministic Sleep Drive demo sequence (BIDIRECTIONAL).
 *
 * The demo is NOT a set of hard-coded states — every step is a scripted
 * conversation event (a response latency + transcript, a driver-initiated
 * turn, or one silence timeout) that flows through the SAME engine as live
 * voice. The progression (NORMAL -> ATTENTION -> ELEVATED -> HIGH_CONCERN)
 * is a genuine consequence of the changing interaction signals.
 *
 * Pacing mirrors real product behaviour:
 *   • healthy phase — one check-in, a human acknowledgement, then LONG quiet
 *     periods (the passenger stays silent while monitoring)
 *   • DRIVER-INITIATED turns — the driver asks about road risk and a safer
 *     route, and Routiq answers contextually (one continuous conversation)
 *   • music request WITH explicit consent (music plays only after "yeah")
 *   • degradation phase — intervals shorten as responses slow, ending in
 *     prolonged silence -> HIGH_CONCERN.
 *
 * Times are seconds after session start. The whole sequence runs ~4 minutes.
 */
import { MUSIC_OFFER } from '../conversation/phrases'

export interface DemoStep {
  /** seconds after session start when this step fires */
  at: number
  /** response = proactive check-in answered; driver = driver speaks first;
   *  silence = check-in with no answer (engine times it out) */
  kind: 'response' | 'driver' | 'silence'
  /** latency of the scripted response (ms) — prompt -> speech start */
  latency_ms?: number
  /** what the (simulated) driver says */
  transcript?: string
  /** optional explicit prompt override (otherwise the engine picks one) */
  prompt?: string
  /** for driver-initiated steps: the classified intent (deterministic) */
  intent?: string
  /** for driver-initiated steps: the deterministic contextual reply */
  reply?: string
}

export const DEMO_SCRIPT: DemoStep[] = [
  // ── 0–90s · NORMAL — check-in, ack, LONG quiet; driver speaks first ────
  { at: 0, kind: 'response', latency_ms: 1400, transcript: "Pretty good." },
  // driver-initiated — road-safety question answered contextually
  {
    at: 45,
    kind: 'driver',
    transcript: 'Routiq, how risky is the road ahead?',
    intent: 'SAFETY_QUERY',
    reply:
      'This stretch is currently rated 74 out of 100. The main concerns are poor lighting and a couple of reported hazards up ahead.',
  },
  // driver-initiated — route request
  {
    at: 75,
    kind: 'driver',
    transcript: 'Can you find me a safer route?',
    intent: 'ROUTE_REQUEST',
    reply: "Sure — I'll check the alternatives and let you know.",
  },

  // ── 105s · music consent — plays ONLY after the driver says yes ────────
  { at: 105, kind: 'response', latency_ms: 1800, transcript: 'Yeah, sure.', prompt: MUSIC_OFFER },

  // ── 150s+ · ATTENTION — responses start slowing noticeably ────────────
  { at: 150, kind: 'response', latency_ms: 2800, transcript: 'Yeah… here.' },
  { at: 175, kind: 'response', latency_ms: 3600, transcript: 'Mhm.' },

  // ── 200s+ · ELEVATED — repeated delays, fading replies ────────────────
  { at: 200, kind: 'response', latency_ms: 5200, transcript: "Yeah, I'm still—" },
  { at: 225, kind: 'response', latency_ms: 6400, transcript: 'Hmm?' },

  // ── 260s+ · HIGH_CONCERN — prolonged silence ends at the critical overlay
  //     (the engine fires the timeout at max_wait_seconds).
  { at: 260, kind: 'silence' },
]

/** Prompt override for the turn that precedes the silence (the critical beat). */
export const DEMO_SILENCE_PROMPT = 'Hey, are you still with me?'
