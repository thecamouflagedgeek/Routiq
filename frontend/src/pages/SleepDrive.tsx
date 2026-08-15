import { useMemo, useState } from "react";
import { useRef } from "react";
import {
  ArrowRight,
  BrainCircuit,
  Gauge,
  Languages,
  Mic,
  MicOff,
  Music4,
  Pause,
  PhoneCall,
  Play,
  Power,
  ShieldCheck,
  Siren,
  Sparkles,
  Square,
  Timer,
  Volume2,
  Waves,
} from "lucide-react";
import {
  PillButton,
  RiskBadge,
  ScoreGauge,
  SectionLabel,
  Spinner,
} from "../components/ui";
import { LANGUAGES, RISK_STATE_META, languageLabel } from "../config";
import type { UseFatigue } from "../hooks/useFatigue";
import type { DriverRiskState } from "../types";

/** Human labels for the rich conversation states (Listening / speaking / quiet…). */
const CONV_STATE_LABEL: Record<string, string> = {
  IDLE: "Idle",
  CHECK_IN: "Checking in",
  WAITING_FOR_RESPONSE: "Listening for your response",
  ANALYZING: "Processing",
  INTERVENTION: "Intervening",
  QUIET_MONITORING: "Quiet monitoring",
  LISTENING: "Listening",
  PROCESSING: "Processing",
  AI_SPEAKING: "Routiq is speaking",
  WAITING_FOR_USER: "Listening — you can speak anytime",
  MUSIC_PERMISSION: "Asking about music",
  SAFETY_CHECK: "Safety check",
  ESCALATION: "Escalating",
  ERROR: "Error",
};

const FATIGUE_RISK_LABEL: Record<DriverRiskState, string> = {
  NORMAL: "LOW",
  ATTENTION: "MODERATE",
  ELEVATED: "HIGH",
  HIGH_CONCERN: "CRITICAL",
};

const ESCALATION_STEPS = [
  {
    state: "NORMAL",
    label: "Normal",
    color: "#22c55e",
    desc: "Responses close to personal baseline",
  },
  {
    state: "ATTENTION",
    label: "Attention",
    color: "#eab308",
    desc: "One or more responses noticeably slower",
  },
  {
    state: "ELEVATED",
    label: "Elevated",
    color: "#f97316",
    desc: "Repeated delays / reduced engagement",
  },
  {
    state: "HIGH_CONCERN",
    label: "High concern",
    color: "#ef4444",
    desc: "Repeated severe delays or prolonged silence",
  },
];

/** Typed fallback for mic-unavailable environments — also how the judge can
 *  send a driver-initiated message (e.g. a Hindi fatigue disclosure) without
 *  a working microphone. Goes through the same conversation path as voice. */
function DriverMessageBox({ onSend }: { onSend: (text: string) => void }) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="mt-2 flex w-full max-w-sm items-center gap-2">
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && value.trim()) {
            onSend(value.trim());
            setValue("");
          }
        }}
        placeholder="Or type a message to Routiq…"
        className="min-w-0 flex-1 rounded-full border border-neutral-300 bg-white px-3 py-1.5 text-xs text-neutral-800 outline-none focus:border-neutral-400"
      />
      <button
        onClick={() => {
          if (!value.trim()) return;
          onSend(value.trim());
          setValue("");
        }}
        className="flex shrink-0 cursor-pointer items-center gap-1 rounded-full bg-neutral-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-neutral-700"
      >
        Send <ArrowRight size={12} />
      </button>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  color,
  trend,
}: {
  label: string;
  value: string;
  sub?: string;
  color: string;
  trend?: "up" | "down" | "flat";
}) {
  return (
    <div className="flex-1 rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-center shadow-sm">
      <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-neutral-400">
        {label}
      </div>
      <div className="mt-0.5 flex items-baseline justify-center gap-1">
        <span
          className="text-2xl font-black tabular-nums tracking-tight"
          style={{ color }}
        >
          {value}
        </span>
        {trend === "down" && (
          <span className="text-sm font-black text-red-500">↓</span>
        )}
        {trend === "up" && (
          <span className="text-sm font-black text-red-500">↑</span>
        )}
      </div>
      {sub && (
        <div className="text-[10px] font-medium text-neutral-400">{sub}</div>
      )}
    </div>
  );
}

export function SleepDrive({
  fatigue: f,
  onGoEmergency,
}: {
  fatigue: UseFatigue;
  onGoEmergency: () => void;
}) {
  const [showSettings, setShowSettings] = useState(false);
  const waiting = f.phase === "waiting";
  const analyzing = f.phase === "analyzing";
  const quiet = f.phase === "quiet";
  const critical = f.phase === "alert";

  const d = f.driver;
  const state = d.state;
  const meta = RISK_STATE_META[state];
  const engagement = Math.round(d.engagement * 100);
  const confidence = Math.round(d.confidence * 100);
  const riskLabel = FATIGUE_RISK_LABEL[state];

  const engagementTrend = useMemo(() => {
    if (!f.lastLatency) return "flat" as const;
    const band = f.lastLatency.band;
    return band === "NORMAL" ? ("flat" as const) : ("down" as const);
  }, [f.lastLatency]);

  const responseValue =
    waiting && f.elapsed > 0
      ? `${f.elapsed.toFixed(1)}s`
      : f.lastLatency
        ? `${f.lastLatency.latency.toFixed(1)}s`
        : d.response_latency_ms != null
          ? `${(d.response_latency_ms / 1000).toFixed(1)}s`
          : "—";

  const timerColor = useMemo(() => {
    const e = f.elapsed;
    if (e <= f.thresholds.normal_max) return "#22c55e";
    if (e <= f.thresholds.mild_max) return "#eab308";
    if (e <= f.thresholds.elevated_max) return "#f97316";
    return "#ef4444";
  }, [f.elapsed, f.thresholds]);

  const active = f.phase !== "idle";

  return (
    <div className="flex min-h-screen flex-col bg-neutral-50 pt-20 sm:pt-24">
      {/* ── active session banner ── */}
      {active && (
        <div className="mx-auto w-full max-w-6xl px-4 pt-4">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            {/* conversation language selector */}
            <label className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 py-2 text-xs font-semibold text-neutral-700 shadow-sm">
              <Languages size={14} className="text-neutral-400" />
              Conversation language
              <select
                value={f.language}
                onChange={(e) => f.setLanguage(e.target.value)}
                className="cursor-pointer rounded-lg border border-neutral-200 bg-neutral-50 px-2 py-1 text-xs font-bold text-neutral-900 outline-none"
              >
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label}
                  </option>
                ))}
              </select>
            </label>
            <span
              className="inline-flex items-center gap-1.5 rounded-xl bg-neutral-900 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-white"
              title="Conversation state — controlled by the Conversation Manager"
            >
              <Waves size={12} className="text-orange-400" />
              {CONV_STATE_LABEL[f.conversationState] ?? f.conversationState}
            </span>
            {f.aiAvailable === true && (
              <span className="inline-flex items-center gap-1 rounded-xl bg-violet-50 px-2.5 py-2 text-[10px] font-bold uppercase tracking-widest text-violet-600">
                <Sparkles size={11} /> Groq AI
              </span>
            )}
          </div>
          <div
            className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-medium ${
              f.mode === "demo"
                ? "border-amber-200 bg-amber-50 text-amber-800"
                : "border-emerald-200 bg-emerald-50 text-emerald-800"
            }`}
          >
            {f.mode === "demo" ? (
              <>
                <Timer size={14} className="shrink-0" />
                <span>
                  <b>DEMO SEQUENCE ACTIVE</b> — a deterministic driver is
                  answering the check-ins. Watch the estimate respond to
                  changing response latency in real time.
                </span>
              </>
            ) : (
              <>
                <Waves size={14} className="shrink-0" />
                <span>
                  <b>VOICE MODE ACTIVE</b> — Routiq speaks and listens via your
                  microphone. Answer out loud when a check-in appears. Delays or
                  missed replies raise the fatigue estimate.
                </span>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── mic unavailable banner — never counted as fatigue ── */}
      {active && !d.audio_healthy && (
        <div className="mx-auto w-full max-w-6xl px-4 pt-2">
          <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-xs font-medium text-red-700">
            <MicOff size={14} className="shrink-0" />
            <span>
              <b>MICROPHONE UNAVAILABLE</b> — silence will not raise your
              fatigue estimate while the mic is down. Use the simulate buttons
              below to keep demonstrating.
            </span>
          </div>
        </div>
      )}

      {/* ── main two-column grid ── */}
      <div className="mx-auto mt-4 grid w-full max-w-6xl flex-1 gap-5 px-4 pb-8 lg:grid-cols-[1fr_340px] lg:min-h-0">
        {/* ────────────── CONVERSATION COLUMN ────────────── */}
        <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
          {/* section header */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-neutral-100 px-5 py-4">
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutral-900">
                <Waves size={16} className="text-orange-400" />
              </span>
              <div>
                <div className="text-sm font-bold text-neutral-900">
                  Sleep Drive
                </div>
                <div className="text-[10px] font-semibold uppercase tracking-widest text-neutral-400">
                  Conversational engagement
                </div>
              </div>
            </div>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest"
                style={{
                  backgroundColor: `${meta.color}18`,
                  color: meta.color,
                }}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${active ? "pulse-dot" : ""}`}
                  style={{ backgroundColor: meta.color }}
                />
                {state.replace(/_/g, " ")}
              </span>
              {f.mode === "demo" ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-amber-600">
                  <Timer size={11} /> Demo assistant
                </span>
              ) : (
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest ${
                    f.listening
                      ? "bg-green-50 text-green-600"
                      : "bg-neutral-100 text-neutral-400"
                  }`}
                >
                  {f.listening ? (
                    <Mic size={11} className="listening-pulse" />
                  ) : (
                    <MicOff size={11} />
                  )}
                  {f.listening ? "Listening" : "Mic idle"}
                </span>
              )}
              {f.questionSource === "ai" && (
                <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-violet-600">
                  <Sparkles size={9} /> AI
                </span>
              )}
            </div>
          </div>

          {/* ── body ── */}
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center p-6 text-center">
            {/* ── IDLE ONBOARDING ── */}
            {f.phase === "idle" && (
              <div className="max-w-sm">
                <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-neutral-900 shadow-lg">
                  <BrainCircuit size={28} className="text-white" />
                </div>
                <h2 className="text-xl font-bold text-neutral-900">
                  Conversation as a safety signal
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-neutral-500">
                  Routiq learns <em>how you normally respond</em>, then watches
                  for changes — slower replies, silence, missed check-ins. It
                  escalates like a considerate passenger, never a warning alarm.
                </p>
                <div className="mt-5 flex items-center justify-center gap-2">
                  <PillButton variant="black" onClick={() => f.start("live")}>
                    <Mic size={15} /> Start Sleep Drive
                  </PillButton>
                  <PillButton variant="grey" onClick={() => f.start("demo")}>
                    <Play size={15} /> Demo sequence
                  </PillButton>
                </div>
                <p className="mt-3 text-[11px] text-neutral-400">
                  Microphone + speakers — no camera, no typing needed.
                </p>
              </div>
            )}

            {/* ── ACTIVE STATES ── */}
            {active && (
              <div className="flex w-full max-w-lg flex-col items-center gap-4">
                {/* judge-visible stats: engagement / fatigue risk / response */}
                <div className="flex w-full gap-2">
                  <Stat
                    label="Engagement"
                    value={`${engagement}%`}
                    color={meta.color}
                    trend={engagementTrend}
                  />
                  <Stat
                    label="Fatigue risk"
                    value={riskLabel}
                    sub={meta.description}
                    color={meta.color}
                  />
                  <Stat
                    label="Response"
                    value={responseValue}
                    sub={waiting ? "elapsed" : "last turn"}
                    color={waiting ? timerColor : meta.color}
                  />
                </div>

                {waiting && (
                  <>
                    {/* question text */}
                    <div className="w-full">
                      <div className="flex items-center justify-center gap-2">
                        <SectionLabel>Listening for your response</SectionLabel>
                      </div>
                      <p className="mt-2 text-2xl font-bold leading-snug tracking-tight text-neutral-900 sm:text-3xl">
                        {f.question}
                      </p>
                    </div>

                    {/* voice orb */}
                    <div className="relative flex h-32 w-32 items-center justify-center">
                      {f.listening && (
                        <>
                          <span
                            className="absolute inset-0 rounded-full bg-orange-400 opacity-[0.18]"
                            style={{
                              animation:
                                "ping 1.5s cubic-bezier(0,0,0.2,1) infinite",
                            }}
                          />
                          <span
                            className="absolute rounded-full bg-orange-400 opacity-[0.28]"
                            style={{
                              width: 92,
                              height: 92,
                              animation:
                                "ping 1.1s cubic-bezier(0,0,0.2,1) infinite",
                            }}
                          />
                        </>
                      )}
                      <button
                        onClick={() =>
                          f.listening && f.demoReply("I am here, all good.")
                        }
                        title={
                          f.listening
                            ? "Tap to confirm you are awake (or just speak)"
                            : "Waiting for mic…"
                        }
                        className="relative z-10 flex h-16 w-16 cursor-pointer items-center justify-center rounded-full shadow-2xl transition-all duration-300 focus:outline-none"
                        style={{
                          background: f.listening ? "#f97316" : "#1c1c1c",
                          transform: f.listening ? "scale(1.08)" : "scale(1)",
                        }}
                      >
                        {f.listening ? (
                          <Mic size={26} className="text-white" />
                        ) : (
                          <MicOff size={22} className="text-neutral-500" />
                        )}
                      </button>
                    </div>

                    <p
                      className={`-mt-1 text-sm font-semibold ${f.listening ? "animate-pulse text-orange-500" : "text-neutral-400"}`}
                    >
                      {f.mode === "demo"
                        ? "Simulated driver responding…"
                        : f.listening
                          ? "🎙 Listening — speak out loud"
                          : "Warming up microphone…"}
                    </p>

                    {f.transcript && (
                      <div className="w-full rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-left text-sm italic text-neutral-600">
                        <span className="mb-1 block text-[10px] font-bold not-italic uppercase tracking-wider text-neutral-400">
                          Heard:
                        </span>
                        “{f.transcript}”
                      </div>
                    )}

                    {/* simulate controls — mic unavailable */}
                    {f.mode === "live" &&
                      (!f.micSupported || !d.audio_healthy) && (
                        <div className="w-full rounded-2xl border border-amber-200 bg-amber-50 p-4 text-left">
                          <p className="mb-3 text-xs font-semibold text-amber-700">
                            Simulate a response:
                          </p>
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              onClick={() =>
                                f.demoReply("I'm fine, still here.")
                              }
                              className="cursor-pointer rounded-xl bg-green-500 px-3 py-2.5 text-xs font-bold text-white hover:bg-green-400"
                            >
                              ✓ Reply now
                            </button>
                            <button
                              onClick={() =>
                                f.simulateDelayedReply(
                                  "Yeah… here. Sorry.",
                                  6000,
                                )
                              }
                              className="cursor-pointer rounded-xl bg-orange-500 px-3 py-2.5 text-xs font-bold text-white hover:bg-orange-400"
                            >
                              ⏱ Delayed reply (6s)
                            </button>
                            <button
                              onClick={() => f.forceTimeout()}
                              className="col-span-2 cursor-pointer rounded-xl border border-red-300 bg-white px-3 py-2.5 text-xs font-bold text-red-600 hover:bg-red-50"
                            >
                              ✕ Simulate no-response
                            </button>
                          </div>
                        </div>
                      )}
                  </>
                )}

                {/* ── latency result ── */}
                {(analyzing || quiet) && f.lastLatency && (
                  <div
                    className="w-full rounded-2xl border px-5 py-4"
                    style={{
                      borderColor: `${f.lastLatency.color}55`,
                      backgroundColor: `${f.lastLatency.color}0d`,
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">
                        Response latency
                      </span>
                      <span
                        className="rounded-full px-2.5 py-0.5 text-[10px] font-bold"
                        style={{
                          backgroundColor: `${f.lastLatency.color}22`,
                          color: f.lastLatency.color,
                        }}
                      >
                        {f.lastLatency.label}
                      </span>
                    </div>
                    <div className="mt-1 flex items-baseline gap-1.5">
                      <span
                        className="text-3xl font-extrabold tabular-nums"
                        style={{ color: f.lastLatency.color }}
                      >
                        {f.lastLatency.latency.toFixed(1)}
                      </span>
                      <span className="text-sm font-semibold text-neutral-400">
                        sec
                      </span>
                    </div>
                    {f.lastLatency.transcript && (
                      <p className="mt-1.5 text-xs italic text-neutral-500">
                        “{f.lastLatency.transcript}”
                      </p>
                    )}
                    <p
                      className="mt-2 text-xs font-medium"
                      style={{ color: f.lastLatency.color }}
                    >
                      {d.message}
                    </p>
                  </div>
                )}

                {f.phase === "paused" && (
                  <p className="text-sm text-neutral-400">
                    Paused — monitoring on hold.
                  </p>
                )}
                {f.phase === "intro" && (
                  <p className="animate-pulse text-sm font-semibold text-neutral-500">
                    Warming up…
                  </p>
                )}

                {/* ── QUIET MONITORING — the passenger stays silent ── */}
                {quiet && (
                  <div className="flex flex-col items-center gap-2">
                    <div className="flex items-center gap-2 rounded-full bg-neutral-900 px-4 py-2 text-xs font-bold text-white">
                      <span className="h-2 w-2 rounded-full bg-green-400 pulse-dot" />
                      Sleep Drive monitoring
                    </div>
                    <p className="text-xs text-neutral-400">
                      The passenger is quiet — listening without talking.
                    </p>
                    <button
                      onClick={f.pushToTalk}
                      className="mt-1 flex cursor-pointer items-center gap-2 rounded-full border border-neutral-300 bg-white px-4 py-2 text-xs font-bold text-neutral-800 hover:bg-neutral-100"
                      title="Speak to Routiq anytime — driver-initiated conversation"
                    >
                      <Mic size={13} /> Talk to Routiq
                    </button>
                    {(!f.micSupported || !d.audio_healthy) && (
                      <DriverMessageBox onSend={(t) => f.demoReply(t)} />
                    )}
                  </div>
                )}

                {/* ── conversation transcript (bounded, driver + Routiq) ── */}
                {!waiting && f.history.length > 0 && (
                  <div className="w-full rounded-2xl border border-neutral-200 bg-neutral-50/60 px-4 py-3 text-left">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">
                        Conversation
                      </span>
                      <span className="text-[9px] font-semibold text-neutral-300">
                        {languageLabel(f.language)}
                      </span>
                    </div>
                    <div className="max-h-36 space-y-1.5 overflow-y-auto">
                      {f.history.slice(-6).map((turn, i) => (
                        <div
                          key={i}
                          className={`flex gap-2 text-xs leading-relaxed ${
                            turn.role === "routiq"
                              ? "text-neutral-700"
                              : "text-neutral-500"
                          }`}
                        >
                          <span
                            className={`shrink-0 font-bold ${turn.role === "routiq" ? "text-orange-500" : "text-neutral-400"}`}
                          >
                            {turn.role === "routiq" ? "Routiq" : "You"}
                          </span>
                          <span>{turn.text}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* next check-in — machine explanation stays in the UI, never spoken */}
                {f.cooldownRemaining > 0.5 &&
                  !waiting &&
                  (quiet || analyzing) && (
                    <p className="text-[11px] font-medium text-neutral-400">
                      Next check-in in ~{Math.ceil(f.cooldownRemaining)}s ·{" "}
                      {state === "NORMAL"
                        ? "quiet monitoring"
                        : "pacing interventions"}
                    </p>
                  )}
              </div>
            )}
          </div>
        </section>

        {/* ────────────── SIDE COLUMN ────────────── */}
        <aside className="flex flex-col gap-4">
          {/* driving status */}
          <section className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <SectionLabel>Driver state</SectionLabel>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-blue-600">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-500 pulse-dot" />{" "}
                In motion
              </span>
            </div>
            <div className="mt-3 flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-neutral-900">
                  Attention state
                </div>
                <div className="text-[11px] text-neutral-400">
                  {meta.description}
                </div>
              </div>
              <RiskBadge level={meta.riskLabel} />
            </div>
            <div className="mt-3 flex items-center justify-around">
              <div className="text-center">
                <div
                  className="text-3xl font-black tabular-nums"
                  style={{ color: meta.color }}
                >
                  {engagement}%
                </div>
                <div className="text-[10px] font-semibold uppercase tracking-widest text-neutral-400">
                  Engagement
                </div>
              </div>
              <ScoreGauge score={confidence} size={92} label="Confidence" />
            </div>
            {d.baseline_latency_ms != null && (
              <div className="mt-3 flex items-center justify-center gap-1.5 rounded-xl bg-neutral-50 py-2 text-[11px] font-semibold text-neutral-500">
                <Gauge size={12} className="text-neutral-400" />
                Personal baseline {(d.baseline_latency_ms / 1000).toFixed(1)}s ·{" "}
                {d.baseline_samples > 0
                  ? `${d.baseline_samples} samples`
                  : "learning…"}
              </div>
            )}
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-neutral-50 py-2">
                <div className="text-lg font-extrabold text-neutral-900">
                  {d.recent_delayed_responses}
                </div>
                <div className="text-[9px] font-semibold uppercase tracking-widest text-neutral-400">
                  Delayed
                </div>
              </div>
              <div className="rounded-xl bg-neutral-50 py-2">
                <div className="text-lg font-extrabold text-neutral-900">
                  {d.missed_responses}
                </div>
                <div className="text-[9px] font-semibold uppercase tracking-widest text-neutral-400">
                  Missed
                </div>
              </div>
              <div className="rounded-xl bg-neutral-50 py-2">
                <div className="text-lg font-extrabold text-neutral-900">
                  {d.interventions_triggered}
                </div>
                <div className="text-[9px] font-semibold uppercase tracking-widest text-neutral-400">
                  Interventions
                </div>
              </div>
            </div>
          </section>

          {/* evidence */}
          <section className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
            <SectionLabel>Why this estimate</SectionLabel>
            {d.evidence.length === 0 ? (
              <p className="mt-2 text-xs text-neutral-400">
                Collecting interaction signals…
              </p>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {d.evidence.map((e) => (
                  <li
                    key={e}
                    className="flex items-start gap-2 text-xs text-neutral-600"
                  >
                    <span
                      className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: meta.color }}
                    />
                    {e}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* escalation ladder */}
          <section className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
            <SectionLabel>Escalation ladder</SectionLabel>
            <div className="mt-3 space-y-2">
              {ESCALATION_STEPS.map((s) => (
                <div
                  key={s.state}
                  className={`flex items-center gap-3 rounded-xl border px-3 py-2 transition-colors ${
                    state === s.state
                      ? "border-neutral-800 bg-neutral-50"
                      : "border-neutral-100"
                  }`}
                >
                  <span
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-extrabold text-white"
                    style={{
                      backgroundColor: state === s.state ? s.color : "#d4d4d4",
                    }}
                  >
                    {ESCALATION_STEPS.indexOf(s) + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={`block text-xs font-bold ${state === s.state ? "text-neutral-900" : "text-neutral-500"}`}
                    >
                      {s.label}
                    </span>
                    <span className="block truncate text-[10px] text-neutral-400">
                      {s.desc}
                    </span>
                  </span>
                  {state === s.state && (
                    <Gauge size={14} style={{ color: s.color }} />
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* assistant toggle */}
          <section className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
            <SectionLabel>Assistant</SectionLabel>
            <div className="mt-3 flex items-center justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-xs font-medium text-neutral-700">
                  <Sparkles size={13} className="text-violet-500" /> AI
                  conversation
                </div>
                <div className="mt-0.5 truncate text-[10px] text-neutral-400">
                  {f.aiAvailable === null
                    ? "Probing AI availability…"
                    : f.aiAvailable
                      ? "Groq conversational replies (falls back to scripted)"
                      : "Scripted assistant — AI unavailable"}
                </div>
              </div>
              <button
                onClick={() => f.setAi(!f.aiEnabled)}
                className={`relative h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors ${f.aiEnabled ? "bg-violet-600" : "bg-neutral-300"}`}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${f.aiEnabled ? "left-[22px]" : "left-0.5"}`}
                />
              </button>
            </div>
          </section>

          {/* audio controls */}
          <section className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
            <SectionLabel>Audio controls</SectionLabel>
            <div className="mt-3 space-y-3">
              <label className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-xs font-medium text-neutral-700">
                  <Volume2 size={14} className="text-neutral-400" /> Voice
                  assistant (TTS)
                </span>
                <button
                  onClick={() => f.setTts(!f.ttsEnabled)}
                  className={`relative h-6 w-11 cursor-pointer rounded-full transition-colors ${f.ttsEnabled ? "bg-neutral-900" : "bg-neutral-300"}`}
                >
                  <span
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${f.ttsEnabled ? "left-[22px]" : "left-0.5"}`}
                  />
                </button>
              </label>
              {/* Music — an OPTIONAL intervention. Never auto-starts; it
                  plays only after the driver explicitly agrees. */}
              <div>
                <div className="flex items-center justify-between text-xs font-medium text-neutral-700">
                  <span className="flex items-center gap-2">
                    <Music4 size={14} className="text-neutral-400" /> Music
                  </span>
                  <span className="text-[10px] text-neutral-400">
                    only after you ask
                  </span>
                </div>
                <div className="mt-2 rounded-xl bg-neutral-50 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold text-neutral-700">
                      {f.musicConsent === "accepted"
                        ? "● Playing — with your consent"
                        : f.musicConsent === "pending"
                          ? "⏳ Waiting for your answer…"
                          : f.musicConsent === "declined"
                            ? "✕ Not playing"
                            : "○ Not requested"}
                    </span>
                    {f.musicConsent === "accepted" ? (
                      <button
                        onClick={f.stopMusic}
                        className="cursor-pointer rounded-full bg-neutral-900 px-2.5 py-1 text-[10px] font-bold text-white hover:bg-neutral-700"
                      >
                        Stop music
                      </button>
                    ) : (
                      <button
                        onClick={f.offerMusic}
                        disabled={
                          f.musicConsent === "pending" || f.phase === "waiting"
                        }
                        className="cursor-pointer rounded-full bg-white px-2.5 py-1 text-[10px] font-bold text-neutral-900 ring-1 ring-neutral-300 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Ask to play music
                      </button>
                    )}
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={0.4}
                    step={0.05}
                    defaultValue={0.1}
                    disabled={f.musicConsent !== "accepted"}
                    onChange={(e) => f.setMusicVolume(Number(e.target.value))}
                    className="mt-1.5 w-full accent-neutral-900 disabled:opacity-40"
                  />
                </div>
              </div>
            </div>
          </section>

          {/* thresholds */}
          <section className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
            <button
              onClick={() => setShowSettings((v) => !v)}
              className="flex w-full cursor-pointer items-center justify-between"
            >
              <SectionLabel>Latency thresholds</SectionLabel>
              <span className="text-[10px] font-bold text-neutral-400">
                {showSettings ? "−" : "+"}
              </span>
            </button>
            {showSettings && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                {(
                  [
                    ["normal_max", "Normal ≤"],
                    ["mild_max", "Mild ≤"],
                    ["elevated_max", "Elevated ≤"],
                    ["max_wait_seconds", "Max wait"],
                  ] as const
                ).map(([key, label]) => (
                  <label
                    key={key}
                    className="rounded-xl bg-neutral-50 px-3 py-2"
                  >
                    <span className="block text-[10px] font-semibold uppercase tracking-widest text-neutral-400">
                      {label} (s)
                    </span>
                    <input
                      type="number"
                      step={0.5}
                      value={f.thresholds[key]}
                      onChange={(e) =>
                        f.updateThresholds({
                          ...f.thresholds,
                          [key]: Number(e.target.value),
                        })
                      }
                      className="mt-0.5 w-full bg-transparent text-sm font-bold text-neutral-900 outline-none"
                    />
                  </label>
                ))}
              </div>
            )}
          </section>

          {/* session controls */}
          <section className="flex flex-col gap-2">
            {f.phase === "idle" ? (
              <div className="grid grid-cols-2 gap-2">
                <PillButton variant="black" onClick={() => f.start("live")}>
                  <Mic size={15} /> Live
                </PillButton>
                <PillButton variant="grey" onClick={() => f.start("demo")}>
                  <Play size={15} /> Demo
                </PillButton>
              </div>
            ) : (
              <>
                <div className="flex gap-2">
                  {f.phase === "paused" ? (
                    <PillButton
                      variant="black"
                      className="flex-1"
                      onClick={() => f.resume()}
                    >
                      <Play size={15} /> Resume
                    </PillButton>
                  ) : (
                    <PillButton
                      variant="grey"
                      className="flex-1"
                      onClick={f.pause}
                    >
                      <Pause size={15} /> Pause
                    </PillButton>
                  )}
                  <PillButton
                    variant="grey"
                    onClick={f.stop}
                    title="Stop monitoring"
                  >
                    <Square size={14} />
                  </PillButton>
                  <PillButton
                    variant="outline"
                    onClick={f.stop}
                    title="Exit Sleep Drive"
                  >
                    <Power size={14} />
                  </PillButton>
                </div>
              </>
            )}
          </section>

          {active && (
            <p className="text-center text-[10px] leading-relaxed text-neutral-400">
              Estimates possible fatigue / reduced engagement — not a medical
              diagnosis. If drowsy, stop driving.
            </p>
          )}
        </aside>
      </div>

      {/* ── disclaimer ── */}
      <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 pb-6">
        <ShieldCheck size={12} className="shrink-0 text-neutral-400" />
        <p className="text-[10px] leading-relaxed text-neutral-400">
          Bluetooth-ready: in a production vehicle this runs through car
          speakers and microphone via the audio transport. Here it uses your
          computer's mic and speakers. Audio failures never count toward
          fatigue.
        </p>
      </div>

      {/* ── critical fatigue overlay ── */}
      {critical && (
        <div className="fixed inset-0 z-[1500] flex items-center justify-center bg-red-950/90 p-4 backdrop-blur-sm">
          <div className="alert-flash w-full max-w-md rounded-3xl border-2 border-red-400 bg-red-50 p-8 text-center">
            <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-red-500 text-white">
              <Siren size={36} className="animate-pulse" />
            </div>
            <h2 className="text-2xl font-extrabold tracking-tight text-red-600">
              POSSIBLE REDUCED ENGAGEMENT
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-red-900/80">
              No reliable response for a while. If you're feeling tired, please
              pull over at the next safe location as soon as it is safe to do
              so.
            </p>
            <div className="mt-3 rounded-xl bg-red-100/70 p-3 text-left text-[11px] font-medium text-red-800">
              <div className="mb-1 font-bold uppercase tracking-widest text-red-500">
                Evidence
              </div>
              <ul className="space-y-0.5">
                {d.evidence.map((e) => (
                  <li key={e}>• {e}</li>
                ))}
              </ul>
            </div>
            <div className="mt-5 flex flex-col gap-2">
              <PillButton variant="black" onClick={f.recover}>
                <Power size={15} /> I'm OK — I'm awake
              </PillButton>
              <div className="flex gap-2">
                <PillButton
                  variant="red"
                  className="flex-1"
                  onClick={() => window.open("tel:112")}
                >
                  <PhoneCall size={15} /> Call 112
                </PillButton>
                <PillButton
                  variant="outline"
                  className="flex-1"
                  onClick={onGoEmergency}
                >
                  Emergency <ArrowRight size={14} />
                </PillButton>
              </div>
            </div>
            <p className="mt-4 text-[10px] text-red-900/50">
              Not a medical diagnosis.
            </p>
          </div>
        </div>
      )}

      {/* ── session starting overlay ── */}
      {f.phase === "starting" && (
        <div className="fixed inset-0 z-[1400] flex items-center justify-center bg-white/60 backdrop-blur-sm">
          <div className="flex items-center gap-3 rounded-2xl border border-neutral-200 bg-white px-6 py-4 shadow-xl">
            <Spinner className="h-5 w-5 text-neutral-900" />
            <span className="text-sm font-semibold text-neutral-700">
              Starting Sleep Drive…
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
