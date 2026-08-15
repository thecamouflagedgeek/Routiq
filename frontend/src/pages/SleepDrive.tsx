import {
  ArrowRight,
  Mic,
  MicOff,
  Pause,
  Play,
  Power,
  ShieldCheck,
  Siren,
  Sparkles,
  Square,
  Waves,
} from "lucide-react";
import {
  PillButton,
  RiskBadge,
  ScoreGauge,
  SectionLabel,
} from "../components/ui";
import { useFatigue } from "../hooks/useFatigue";

export function SleepDrive({ onGoEmergency }: { onGoEmergency: () => void }) {
  const f = useFatigue(onGoEmergency);

  const waiting = f.phase === "waiting";
  const analyzing = f.phase === "analyzing";
  const critical = f.phase === "alert";

  const riskLevel =
    f.driver.state === "NORMAL"
      ? "SAFE"
      : f.driver.state === "ATTENTION"
        ? "MODERATE"
        : f.driver.state === "ELEVATED"
          ? "HIGH"
          : "CRITICAL";

  return (
    <div
      className="min-h-screen pb-24 pt-16 transition-colors sm:pt-20"
      style={{ background: "var(--bg)", color: "var(--text)" }}
    >
      <div className="mx-auto max-w-5xl px-4">
        {f.phase !== "idle" && (
          <div
            className="mb-4 flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium"
            style={{
              borderColor: "var(--border)",
              background: "rgba(245, 158, 11, 0.08)",
            }}
          >
            <Waves size={14} className="text-amber-500" />
            <span>Voice mode active — speak naturally when prompted.</span>
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
          <section
            className="rounded-2xl border p-4 shadow-sm"
            style={{
              background: "var(--surface)",
              borderColor: "var(--border)",
            }}
          >
            <div
              className="mb-4 flex items-center justify-between gap-4 border-b pb-3"
              style={{ borderColor: "var(--border)" }}
            >
              <div className="flex items-center gap-2.5">
                <span
                  className="flex h-10 w-10 items-center justify-center rounded-2xl"
                  style={{ background: "var(--text)" }}
                >
                  <Waves size={18} style={{ color: "var(--orange)" }} />
                </span>
                <div>
                  <div className="text-sm font-black tracking-tight">
                    Sleep Drive Monitor
                  </div>
                  <div
                    className="text-[9px] font-extrabold uppercase tracking-widest"
                    style={{ color: "var(--text-4)" }}
                  >
                    Real-time voice fatigue analysis
                  </div>
                </div>
              </div>
              <RiskBadge level={riskLevel} />
            </div>

            <div className="flex min-h-[260px] flex-col items-center justify-center text-center">
              {f.phase === "idle" ? (
                <>
                  <div
                    className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl"
                    style={{ background: "var(--text)" }}
                  >
                    <Mic size={28} style={{ color: "var(--orange)" }} />
                  </div>
                  <h2 className="text-2xl font-black tracking-tight">
                    Hands-free fatigue detection
                  </h2>
                  <p
                    className="mt-2 max-w-md text-sm leading-relaxed"
                    style={{ color: "var(--text-3)" }}
                  >
                    Routiq monitors your attention during the drive using voice
                    check-ins, latency, and quick safety prompts.
                  </p>
                  <div className="mt-6">
                    <PillButton
                      variant="black"
                      onClick={f.start}
                      className="px-6 py-3 text-xs font-black"
                    >
                      <Play size={14} /> Start Sleep Drive
                    </PillButton>
                  </div>
                </>
              ) : (
                <>
                  <div className="mb-3 flex items-center justify-center gap-2">
                    <SectionLabel>
                      {waiting
                        ? f.awaitingLanguage
                          ? "Choose a language"
                          : "Listening for response"
                        : analyzing
                          ? "Analyzing response"
                          : "AI prompt"}
                    </SectionLabel>
                    {f.questionSource === "ai" && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-violet-500/10 px-2 py-0.5 text-[9px] font-bold uppercase text-violet-500">
                        <Sparkles size={9} /> AI
                      </span>
                    )}
                  </div>
                  <p className="max-w-lg text-xl font-black leading-snug">
                    {f.phase === "starting" || f.phase === "intro"
                      ? "Initializing AI engine…"
                      : `"${f.question}"`}
                  </p>
                  <div className="mt-6 flex items-center gap-4">
                    <button
                      type="button"
                      onClick={() =>
                        f.listening && f.demoReply("I am awake and focused.")
                      }
                      className="flex h-16 w-16 items-center justify-center rounded-full shadow-xl transition-transform active:scale-95"
                      style={{
                        background: f.listening ? "#f97316" : "var(--bg-3)",
                      }}
                    >
                      {f.listening ? (
                        <Mic size={24} className="text-white" />
                      ) : (
                        <MicOff size={20} style={{ color: "var(--text-4)" }} />
                      )}
                    </button>
                    <div className="text-left">
                      <div
                        className="text-[10px] font-extrabold uppercase tracking-[0.18em]"
                        style={{ color: "var(--text-4)" }}
                      >
                        Response timer
                      </div>
                      <div
                        className="text-3xl font-black tabular-nums"
                        style={{ color: "var(--orange)" }}
                      >
                        {f.elapsed.toFixed(1)}s
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>

            <div
              className="mt-4 flex items-center gap-2 border-t pt-3"
              style={{ borderColor: "var(--border)" }}
            >
              {f.phase === "idle" ? (
                <PillButton
                  variant="black"
                  className="flex-1 py-2.5 text-xs font-black"
                  onClick={f.start}
                >
                  <Play size={14} /> Start session
                </PillButton>
              ) : (
                <>
                  {f.phase === "paused" ? (
                    <PillButton
                      variant="black"
                      className="flex-1 py-2.5 text-xs font-black"
                      onClick={f.resume}
                    >
                      <Play size={14} /> Resume
                    </PillButton>
                  ) : (
                    <PillButton
                      variant="grey"
                      className="flex-1 py-2.5 text-xs font-black"
                      onClick={f.pause}
                    >
                      <Pause size={14} /> Pause
                    </PillButton>
                  )}
                  <PillButton
                    variant="grey"
                    className="py-2.5"
                    onClick={f.stop}
                    title="Stop monitoring"
                  >
                    <Square size={14} />
                  </PillButton>
                  <PillButton
                    variant="outline"
                    className="py-2.5"
                    onClick={onGoEmergency}
                    title="Exit Sleep Drive"
                  >
                    <Power size={14} />
                  </PillButton>
                </>
              )}
            </div>
          </section>

          <aside className="space-y-4">
            <section
              className="rounded-2xl border p-3.5 shadow-sm"
              style={{
                background: "var(--surface)",
                borderColor: "var(--border)",
              }}
            >
              <div className="flex items-center justify-between">
                <SectionLabel>Driver attention</SectionLabel>
                <ShieldCheck size={14} style={{ color: "var(--orange)" }} />
              </div>
              <div className="mt-3 flex items-center justify-center">
                <ScoreGauge
                  score={Math.round(f.driver.confidence * 100)}
                  size={92}
                  label="Confidence"
                />
              </div>
            </section>

            <section
              className="rounded-2xl border p-3.5 shadow-sm"
              style={{
                background: "var(--surface)",
                borderColor: "var(--border)",
              }}
            >
              <SectionLabel>Alert controls</SectionLabel>
              <div className="mt-3 space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Sparkles size={13} className="text-violet-500" /> AI voice
                  </span>
                  <button
                    type="button"
                    onClick={() => f.setAi(!f.aiEnabled)}
                    className={`relative h-5 w-9 rounded-full transition-colors ${f.aiEnabled ? "bg-violet-600" : "bg-neutral-500"}`}
                  >
                    <span
                      className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${f.aiEnabled ? "left-[18px]" : "left-0.5"}`}
                    />
                  </button>
                </div>
                <div
                  className="flex items-center justify-between border-t pt-3"
                  style={{ borderColor: "var(--border)" }}
                >
                  <span className="flex items-center gap-2">
                    <Mic size={13} /> TTS
                  </span>
                  <button
                    type="button"
                    onClick={() => f.setTts(!f.ttsEnabled)}
                    className={`relative h-5 w-9 rounded-full transition-colors ${f.ttsEnabled ? "bg-orange-500" : "bg-neutral-500"}`}
                  >
                    <span
                      className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${f.ttsEnabled ? "left-[18px]" : "left-0.5"}`}
                    />
                  </button>
                </div>
              </div>
            </section>
          </aside>
        </div>
      </div>

      {critical && (
        <div className="fixed inset-0 z-[1500] flex items-center justify-center bg-red-950/90 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl border-2 border-red-400 bg-red-950 p-6 text-center text-white">
            <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-red-600">
              <Siren size={32} className="animate-pulse" />
            </div>
            <h2 className="text-2xl font-black tracking-tight text-red-400">
              Critical fatigue detected
            </h2>
            <p className="mt-2 text-xs leading-relaxed opacity-90">
              Pull over safely at the nearest safe spot or move to emergency
              mode.
            </p>
            <div className="mt-4 flex gap-2">
              <PillButton
                variant="black"
                className="flex-1"
                onClick={f.recover}
              >
                <Power size={14} /> I’m awake
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
        </div>
      )}
    </div>
  );
}
