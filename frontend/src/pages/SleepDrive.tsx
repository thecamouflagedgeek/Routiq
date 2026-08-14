import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Gauge,
  Mic,
  MicOff,
  Music4,
  Pause,
  PhoneCall,
  Play,
  Power,
  Siren,
  Sparkles,
  Square,
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
import type { UseFatigue } from "../hooks/useFatigue";
import type { FatigueStateName } from "../types";

const ESCALATION_STEPS = [
  { level: 0, label: "Normal", color: "#22c55e", desc: "Relaxed conversation" },
  {
    level: 1,
    label: "Mild concern",
    color: "#eab308",
    desc: "Delayed response — follow-up asked",
  },
  {
    level: 2,
    label: "Elevated",
    color: "#f97316",
    desc: "Repeated delays — direct check-in",
  },
  {
    level: 3,
    label: "Critical",
    color: "#ef4444",
    desc: "Possible fatigue — recommend stopping",
  },
];

const STATE_COLOR: Record<FatigueStateName, string> = {
  IDLE: "#a3a3a3",
  NORMAL: "#22c55e",
  QUESTION: "#3b82f6",
  WAITING_FOR_RESPONSE: "#eab308",
  ANALYZE_RESPONSE: "#f97316",
  CAUTION: "#f97316",
  ESCALATE: "#ef4444",
};

export function SleepDrive({
  fatigue: f,
  onGoEmergency,
}: {
  fatigue: UseFatigue;
  onGoEmergency: () => void;
}) {
  const [showSettings, setShowSettings] = useState(false);

  const escalation = f.state.escalation_level;
  const waiting = f.phase === "waiting" || f.phase === "listening";
  const analyzing = f.phase === "analyzing";
  const critical = f.phase === "alert";

  const timerColor = useMemo(() => {
    const e = f.elapsed;
    if (e <= f.thresholds.normal_max) return "#22c55e";
    if (e <= f.thresholds.mild_max) return "#eab308";
    if (e <= f.thresholds.elevated_max) return "#f97316";
    return "#ef4444";
  }, [f.elapsed, f.thresholds]);

  const pct = Math.min(100, (f.elapsed / f.maxWait) * 100);

  return (
    <div className="flex min-h-screen flex-col bg-neutral-50 pt-20 sm:pt-24">
      {/* ── active session banner ── */}
      {f.phase !== "idle" && (
        <div className="mx-auto w-full max-w-6xl px-4 pt-4">
          <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs font-medium text-amber-800">
            <Waves size={14} className="shrink-0" />
            <span>
              <b>VOICE MODE ACTIVE</b> — NexRoad SafeAI speaks and listens via
              your microphone. Answer out loud when a question appears. Delays
              or missed replies escalate the fatigue level.
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
                  Voice fatigue detection
                </div>
              </div>
            </div>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest"
                style={{
                  backgroundColor: `${STATE_COLOR[f.state.state]}18`,
                  color: STATE_COLOR[f.state.state],
                }}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${f.phase !== "idle" ? "pulse-dot" : ""}`}
                  style={{ backgroundColor: STATE_COLOR[f.state.state] }}
                />
                {f.state.state.replace(/_/g, " ")}
              </span>
              {f.phase !== "idle" && (
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
            </div>
          </div>

          {/* ── body ── */}
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center p-6 text-center">
            {/* ── IDLE ONBOARDING ── */}
            {f.phase === "idle" && (
              <div className="max-w-sm">
                <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-neutral-900 shadow-lg">
                  <Mic size={28} className="text-white" />
                </div>
                <h2 className="text-xl font-bold text-neutral-900">
                  Hands-free fatigue detection
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-neutral-500">
                  NexRoad SafeAI <em>talks</em> to you as you drive — just speak
                  naturally. It measures how fast you respond and escalates if
                  you go quiet.
                </p>
                <div className="mt-5">
                  <PillButton variant="black" onClick={f.start}>
                    <Play size={15} /> Start Sleep Drive
                  </PillButton>
                </div>
                <p className="mt-3 text-[11px] text-neutral-400">
                  Microphone + speakers — no camera, no typing needed.
                </p>
              </div>
            )}

            {/* ── ACTIVE STATES ── */}
            {f.phase !== "idle" && (
              <div className="flex w-full max-w-lg flex-col items-center gap-5">
                {/* question text */}
                <div className="w-full">
                  <div className="flex items-center justify-center gap-2">
                    <SectionLabel>
                      {waiting
                        ? "Listening for your response"
                        : analyzing
                          ? "Analysing…"
                          : "Status"}
                    </SectionLabel>
                    {f.questionSource === "ai" && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-violet-600">
                        <Sparkles size={9} /> AI
                      </span>
                    )}
                  </div>
                  <p
                    className={`mt-2 text-2xl font-bold leading-snug tracking-tight text-neutral-900 sm:text-3xl ${
                      f.phase === "starting" || f.phase === "intro"
                        ? "animate-pulse"
                        : ""
                    }`}
                  >
                    {f.phase === "starting" || f.phase === "intro"
                      ? "Starting up…"
                      : f.question}
                  </p>
                </div>

                {/* ── VOICE ORB ── shown while waiting */}
                {waiting && (
                  <>
                    {/* animated orb */}
                    <div className="relative flex h-36 w-36 items-center justify-center">
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
                              width: 104,
                              height: 104,
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
                        className="relative z-10 flex h-20 w-20 cursor-pointer items-center justify-center rounded-full shadow-2xl transition-all duration-300 focus:outline-none"
                        style={{
                          background: f.listening ? "#f97316" : "#1c1c1c",
                          transform: f.listening ? "scale(1.1)" : "scale(1)",
                        }}
                      >
                        {f.listening ? (
                          <Mic size={30} className="text-white" />
                        ) : (
                          <MicOff size={26} className="text-neutral-500" />
                        )}
                      </button>
                    </div>

                    {/* mic status */}
                    <p
                      className={`-mt-2 text-sm font-semibold ${f.listening ? "text-orange-500 animate-pulse" : "text-neutral-400"}`}
                    >
                      {f.listening
                        ? "🎙 Listening — speak out loud"
                        : "Warming up microphone…"}
                    </p>

                    {/* live transcript */}
                    {f.transcript && (
                      <div className="w-full rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-left text-sm italic text-neutral-600">
                        <span className="mb-1 block text-[10px] font-bold not-italic uppercase tracking-wider text-neutral-400">
                          Heard:
                        </span>
                        "{f.transcript}"
                      </div>
                    )}

                    {/* timer bar */}
                    <div className="w-full">
                      <div className="mb-1.5 flex items-end justify-between">
                        <span className="text-xs font-semibold text-neutral-400">
                          Response timer
                        </span>
                        <span
                          className="text-2xl font-extrabold tabular-nums"
                          style={{ color: timerColor }}
                        >
                          {f.elapsed.toFixed(1)}s
                        </span>
                      </div>
                      <div className="h-2.5 w-full overflow-hidden rounded-full bg-neutral-100">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${pct}%`,
                            backgroundColor: timerColor,
                            transition:
                              "width 0.1s linear, background-color 0.4s ease",
                          }}
                        />
                      </div>
                      <div className="mt-1.5 flex justify-between text-[10px] font-medium text-neutral-400">
                        <span>normal ≤{f.thresholds.normal_max}s</span>
                        <span>mild ≤{f.thresholds.mild_max}s</span>
                        <span>elevated ≤{f.thresholds.elevated_max}s</span>
                        <span>max {f.thresholds.max_wait_seconds}s</span>
                      </div>
                    </div>

                    {/* demo fallback (only when mic not available) */}
                    {!f.micSupported && (
                      <div className="w-full rounded-2xl border border-amber-200 bg-amber-50 p-4 text-left">
                        <p className="mb-3 text-xs font-semibold text-amber-700">
                          Microphone unavailable — simulate a response:
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            onClick={() => f.demoReply("I'm fine, still here.")}
                            className="cursor-pointer rounded-xl bg-green-500 px-3 py-2.5 text-xs font-bold text-white hover:bg-green-400"
                          >
                            ✓ Reply now
                          </button>
                          <button
                            onClick={() =>
                              f.simulateDelayedReply("Yeah… here. Sorry.", 6000)
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

                {/* ── LATENCY RESULT ── */}
                {analyzing && f.lastLatency && (
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
                        "{f.lastLatency.transcript}"
                      </p>
                    )}
                    <p
                      className="mt-2 text-xs font-medium"
                      style={{ color: f.lastLatency.color }}
                    >
                      {f.state.message}
                    </p>
                  </div>
                )}

                {f.phase === "paused" && (
                  <p className="text-sm text-neutral-400">
                    Paused — monitoring on hold.
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
              <SectionLabel>Driving status</SectionLabel>
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
                  Conversational analysis
                </div>
              </div>
              <RiskBadge
                level={
                  escalation === 0
                    ? "SAFE"
                    : escalation === 1
                      ? "MODERATE"
                      : escalation === 2
                        ? "HIGH"
                        : "CRITICAL"
                }
              />
            </div>
            <div className="mt-3 flex justify-center">
              <ScoreGauge
                score={Math.round(f.state.fatigue_confidence * 1.04)}
                size={100}
                label="Fatigue conf."
              />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-center">
              <div className="rounded-xl bg-neutral-50 py-2">
                <div className="text-lg font-extrabold text-neutral-900">
                  {f.state.slow_responses}
                </div>
                <div className="text-[10px] font-semibold uppercase tracking-widest text-neutral-400">
                  Slow
                </div>
              </div>
              <div className="rounded-xl bg-neutral-50 py-2">
                <div className="text-lg font-extrabold text-neutral-900">
                  {f.state.missed_responses}
                </div>
                <div className="text-[10px] font-semibold uppercase tracking-widest text-neutral-400">
                  Missed
                </div>
              </div>
            </div>
          </section>

          {/* escalation steps */}
          <section className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
            <SectionLabel>Escalation level</SectionLabel>
            <div className="mt-3 space-y-2">
              {ESCALATION_STEPS.map((s) => (
                <div
                  key={s.level}
                  className={`flex items-center gap-3 rounded-xl border px-3 py-2 transition-colors ${
                    escalation === s.level
                      ? "border-neutral-800 bg-neutral-50"
                      : "border-neutral-100"
                  }`}
                >
                  <span
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-extrabold text-white"
                    style={{
                      backgroundColor:
                        escalation >= s.level ? s.color : "#d4d4d4",
                    }}
                  >
                    {s.level}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={`block text-xs font-bold ${escalation === s.level ? "text-neutral-900" : "text-neutral-500"}`}
                    >
                      L{s.level} · {s.label}
                    </span>
                    <span className="block truncate text-[10px] text-neutral-400">
                      {s.desc}
                    </span>
                  </span>
                  {escalation === s.level && (
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
                      ? "Gemini replies (falls back to scripted)"
                      : "Scripted assistant — AI quota unavailable"}
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
              <div>
                <div className="flex items-center justify-between text-xs font-medium text-neutral-700">
                  <span className="flex items-center gap-2">
                    <Music4 size={14} className="text-neutral-400" /> Ambient
                    volume
                  </span>
                  <span className="text-[10px] text-neutral-400">
                    rises at L2+
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  defaultValue={0.12}
                  onChange={(e) => f.setMusicVolume(Number(e.target.value))}
                  className="mt-1.5 w-full accent-neutral-900"
                />
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
          <section className="flex gap-2">
            {f.phase === "idle" ? (
              <PillButton variant="black" className="flex-1" onClick={f.start}>
                <Play size={15} /> Start
              </PillButton>
            ) : (
              <>
                {f.phase === "paused" ? (
                  <PillButton
                    variant="black"
                    className="flex-1"
                    onClick={f.resume}
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
              </>
            )}
          </section>

          {f.phase !== "idle" && (
            <p className="text-center text-[10px] leading-relaxed text-neutral-400">
              Experimental — cannot diagnose medical fatigue. If drowsy, stop
              driving.
            </p>
          )}
        </aside>
      </div>

      {/* ── disclaimer ── */}
      <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 pb-6">
        <AlertTriangle size={12} className="shrink-0 text-neutral-400" />
        <p className="text-[10px] leading-relaxed text-neutral-400">
          Bluetooth-ready: in a production vehicle this runs through car
          speakers and microphone. Here it uses your computer's mic and
          speakers.
        </p>
      </div>

      {/* ── critical fatigue overlay ── */}
      {critical && (
        <div className="fixed inset-0 z-[1500] flex items-center justify-center bg-red-950/90 p-4 backdrop-blur-sm">
          <div className="alert-flash w-full max-w-md rounded-3xl border-2 border-red-400 bg-red-50 p-8 text-center">
            <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-red-500 text-white">
              <Siren size={36} className="animate-pulse" />
            </div>
            <h2 className="text-3xl font-extrabold tracking-tight text-red-600">
              POSSIBLE FATIGUE DETECTED
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-red-900/80">
              No reliable response detected. Pull over at the next safe
              opportunity.
            </p>
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
