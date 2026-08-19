import {
  ArrowLeft,
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

export function SleepDrive({
  onGoDashboard,
  onGoEmergency,
}: {
  onGoDashboard: () => void;
  onGoEmergency: () => void;
}) {
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
      className="min-h-screen pb-24 transition-colors"
      style={{ background: "var(--bg)", color: "var(--text)" }}
    >
      {/* Minimal top bar — no full Navbar, just back + title + theme toggle */}
      <header
        className="fixed inset-x-0 top-0 z-[1200] backdrop-blur-md transition-colors"
        style={{
          background: "var(--bg)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div className="flex h-12 items-center justify-between px-3">
          <button
            onClick={onGoDashboard}
            className="flex cursor-pointer items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-bold transition-colors hover:bg-white/5"
            style={{ color: "var(--text)" }}
          >
            <ArrowLeft size={16} />
            Navigate
          </button>
          <span className="text-xs font-extrabold tracking-tight" style={{ color: "var(--text)" }}>
            Sleep Drive
          </span>
          <span className="w-16" />
        </div>
      </header>
      <div className="mx-auto max-w-5xl px-3 pt-14 sm:px-4 sm:pt-16">
        {f.phase !== "idle" && (            <div className="mb-3 flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium sm:mb-4"
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
            className="rounded-2xl border p-3 shadow-sm sm:p-4"
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

            <div className="flex min-h-[200px] flex-col items-center justify-center text-center sm:min-h-[260px]">
              {f.phase === "idle" ? (
                <>
                  <div
                    className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl sm:h-16 sm:w-16"
                    style={{ background: "var(--text)" }}
                  >
                    <Mic size={22} className="sm:hidden" style={{ color: "var(--orange)" }} />
                    <Mic size={28} className="hidden sm:block" style={{ color: "var(--orange)" }} />
                  </div>
                  <h2 className="text-lg font-black tracking-tight sm:text-2xl">
                    Hands-free fatigue detection
                  </h2>
                  <p
                    className="mt-1.5 max-w-md text-xs leading-relaxed sm:mt-2 sm:text-sm"
                    style={{ color: "var(--text-3)" }}
                  >
                    Routiq monitors your attention during the drive using voice
                    check-ins, latency, and quick safety prompts.
                  </p>
                  <div className="mt-4 sm:mt-6">
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
                      className="flex h-12 w-12 items-center justify-center rounded-full shadow-xl transition-transform active:scale-95 sm:h-14 sm:w-14 md:h-16 md:w-16"
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
                    <div className="text-left ml-1">
                      <div
                        className="text-[10px] font-extrabold uppercase tracking-[0.18em]"
                        style={{ color: "var(--text-4)" }}
                      >
                        Response timer
                      </div>
                      <div
                        className="text-2xl font-black tabular-nums sm:text-3xl"
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

          <aside className="space-y-3 sm:space-y-4">
            <section
              className="rounded-2xl border p-3 shadow-sm sm:p-3.5"
              style={{
                background: "var(--surface)",
                borderColor: "var(--border)",
              }}
            >
              <div className="flex items-center justify-between">
                <SectionLabel>Driver attention</SectionLabel>
                <ShieldCheck size={14} style={{ color: "var(--orange)" }} />
              </div>
              <div className="mt-2 flex items-center justify-center sm:mt-3">
                <ScoreGauge
                  score={Math.round(f.driver.confidence * 100)}
                  size={72}
                  label="Confidence"
                  className="sm:hidden"
                />
                <ScoreGauge
                  score={Math.round(f.driver.confidence * 100)}
                  size={92}
                  label="Confidence"
                  className="hidden sm:block"
                />
              </div>
            </section>

            <section
              className="rounded-2xl border p-3 shadow-sm sm:p-3.5"
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
        <div className="fixed inset-0 z-[1500] flex items-center justify-center bg-red-950/90 p-3 backdrop-blur-sm sm:p-4">
          <div className="w-full max-w-md rounded-2xl border-2 border-red-400 bg-red-950 p-5 text-center text-white sm:rounded-3xl sm:p-6">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-red-600 sm:h-16 sm:w-16">
              <Siren size={28} className="animate-pulse sm:hidden" />
              <Siren size={32} className="hidden animate-pulse sm:block" />
            </div>
            <h2 className="text-xl font-black tracking-tight text-red-400 sm:text-2xl">
              Critical fatigue detected
            </h2>
            <p className="mt-1.5 text-[11px] leading-relaxed opacity-90 sm:mt-2 sm:text-xs">
              Pull over safely at the nearest safe spot or move to emergency
              mode.
            </p>
            <div className="mt-3 flex gap-2 sm:mt-4">
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
