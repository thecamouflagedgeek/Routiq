import { useMemo } from 'react'
import {
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
} from 'lucide-react'
import { PillButton, RiskBadge, ScoreGauge, SectionLabel } from '../components/ui'
import { useFatigue } from '../hooks/useFatigue'
import type { FatigueStateName } from '../types'

const ESCALATION_STEPS = [
  { level: 0, label: 'Normal', color: '#22c55e', desc: 'Relaxed conversation — driver alert' },
  { level: 1, label: 'Mild concern', color: '#eab308', desc: 'Delayed response — follow-up asked' },
  { level: 2, label: 'Elevated', color: '#f97316', desc: 'Repeated delays — direct check-in' },
  { level: 3, label: 'Critical', color: '#ef4444', desc: 'Possible fatigue — recommend stopping' },
]

const STATE_COLOR: Record<FatigueStateName, string> = {
  IDLE: '#a3a3a3',
  NORMAL: '#22c55e',
  QUESTION: '#3b82f6',
  WAITING_FOR_RESPONSE: '#eab308',
  ANALYZE_RESPONSE: '#f97316',
  CAUTION: '#f97316',
  ESCALATE: '#ef4444',
}

export function SleepDrive({ onGoEmergency }: { onGoEmergency: () => void }) {
  const f = useFatigue()

  const escalation = f.state.escalation_level
  const waiting = f.phase === 'waiting' || f.phase === 'listening'
  const analyzing = f.phase === 'analyzing'
  const critical = f.phase === 'alert'

  const timerColor = useMemo(() => {
    const e = f.elapsed
    if (e <= f.thresholds.normal_max) return '#22c55e'
    if (e <= f.thresholds.mild_max) return '#eab308'
    if (e <= f.thresholds.elevated_max) return '#f97316'
    return '#ef4444'
  }, [f.elapsed, f.thresholds])

  const pct = Math.min(100, (f.elapsed / f.maxWait) * 100)

  return (
    <div
      className="min-h-screen lg:h-screen lg:max-h-screen flex flex-col pt-16 sm:pt-20 pb-24 px-3 sm:px-6 transition-colors overflow-y-auto lg:overflow-hidden"
      style={{ background: 'var(--bg)', color: 'var(--text)' }}
    >
      <div className="mx-auto w-full max-w-7xl flex-1 flex flex-col gap-3 min-h-0 overflow-y-auto lg:overflow-hidden">

        {/* ── Active Session Banner ── */}
        {f.phase !== 'idle' && (
          <div
            className="flex items-center gap-2 rounded-xl px-3.5 py-1.5 text-xs font-medium border shrink-0"
            style={{
              background: 'rgba(245, 158, 11, 0.08)',
              borderColor: 'rgba(245, 158, 11, 0.2)',
              color: 'var(--text)',
            }}
          >
            <Waves size={14} className="shrink-0 text-amber-500 animate-pulse" />
            <span className="truncate">
              <b>VOICE MODE ACTIVE</b> — Speak out loud when prompted. Delays escalate fatigue score.
            </span>
          </div>
        )}

        {/* ── Main Layout Grid ── */}
        <div className="grid w-full flex-1 gap-4 lg:grid-cols-12 items-stretch min-h-0 overflow-y-auto lg:overflow-hidden">

          {/* ────────────── CONVERSATION MAIN COLUMN (7 cols) ────────────── */}
          <section
            className="lg:col-span-7 flex flex-col justify-between rounded-2xl p-4 sm:p-5 shadow-sm transition-all min-h-0 overflow-hidden"
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
            }}
          >
            {/* Header */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3 shrink-0" style={{ borderColor: 'var(--border)' }}>
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl shadow-inner" style={{ background: 'var(--text)' }}>
                  <Waves size={16} style={{ color: 'var(--orange)' }} />
                </span>
                <div>
                  <div className="text-sm font-black tracking-tight" style={{ color: 'var(--text)' }}>Sleep Drive Monitor</div>
                  <div className="text-[9px] font-extrabold uppercase tracking-widest" style={{ color: 'var(--text-4)' }}>
                    Real-time Voice Fatigue Analysis
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[9px] font-black uppercase tracking-wider"
                  style={{ backgroundColor: `${STATE_COLOR[f.state.state]}18`, color: STATE_COLOR[f.state.state] }}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${f.phase !== 'idle' ? 'pulse-dot' : ''}`}
                    style={{ backgroundColor: STATE_COLOR[f.state.state] }}
                  />
                  {f.state.state.replace(/_/g, ' ')}
                </span>
                {f.phase !== 'idle' && (
                  <span
                    className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[9px] font-black uppercase"
                    style={{
                      background: f.listening ? 'rgba(34,197,94,0.12)' : 'var(--bg-3)',
                      color: f.listening ? '#22c55e' : 'var(--text-3)',
                    }}
                  >
                    {f.listening ? <Mic size={11} className="listening-pulse" /> : <MicOff size={11} />}
                    {f.listening ? 'Listening' : 'Mic idle'}
                  </span>
                )}
              </div>
            </div>

            {/* Body Content Area */}
            <div className="my-auto flex flex-col items-center justify-center py-2 text-center min-h-0 overflow-y-auto">

              {/* IDLE State */}
              {f.phase === 'idle' && (
                <div className="max-w-md py-2 flex flex-col items-center">
                  <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl shadow-md transition-all" style={{ background: 'var(--text)' }}>
                    <Mic size={22} style={{ color: 'var(--orange)' }} />
                  </div>
                  <h2 className="text-xl font-black tracking-tight" style={{ color: 'var(--text)' }}>Hands-free fatigue detection</h2>
                  <p className="mt-1.5 text-xs leading-relaxed max-w-sm" style={{ color: 'var(--text-3)' }}>
                    Routiq SafeAI monitors driver alertness through periodic voice check-ins. Speak naturally — it measures vocal latency in real time.
                  </p>

                  {/* Equalizer Visualizer Box */}
                  <div className="relative mt-4 h-16 w-full max-w-sm overflow-hidden rounded-xl flex items-center justify-center border shadow-inner transition-colors" style={{ background: 'var(--bg-2)', borderColor: 'var(--border)' }}>
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-orange-500/15 via-rose-500/5 to-transparent animate-pulse" />
                    <div className="flex items-center gap-1.5 z-10">
                      {[40, 70, 45, 90, 65, 30, 85, 50, 75, 40].map((h, i) => (
                        <div
                          key={i}
                          className="w-1.5 rounded-full bg-gradient-to-t from-orange-500 to-rose-500 animate-pulse"
                          style={{ height: `${h * 0.6}%`, animationDelay: `${i * 0.15}s` }}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="mt-4">
                    <button
                      onClick={f.start}
                      className="inline-flex items-center gap-2 rounded-xl px-6 py-2.5 text-xs font-black text-white shadow-lg transition-all hover:opacity-90 active:scale-95 cursor-pointer"
                      style={{ background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)' }}
                    >
                      <Play size={14} fill="white" /> START SLEEP DRIVE MONITOR
                    </button>
                  </div>
                </div>
              )}

              {/* ACTIVE State */}
              {f.phase !== 'idle' && (
                <div className="flex w-full max-w-md flex-col items-center gap-3">

                  {/* Question */}
                  <div className="w-full">
                    <div className="flex items-center justify-center gap-1.5">
                      <SectionLabel>
                        {waiting ? 'Listening for response' : analyzing ? 'Analyzing response…' : 'AI Prompt'}
                      </SectionLabel>
                      {f.questionSource === 'ai' && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-violet-500/10 px-2 py-0.5 text-[9px] font-bold uppercase text-violet-500">
                          <Sparkles size={9} /> AI Gemini
                        </span>
                      )}
                    </div>
                    <p className="mt-2 text-xl font-black leading-snug" style={{ color: 'var(--text)' }}>
                      {f.phase === 'starting' || f.phase === 'intro' ? 'Initializing AI Engine…' : `"${f.question}"`}
                    </p>
                  </div>

                  {/* Voice Orb */}
                  {waiting && (
                    <>
                      <div className="relative flex h-24 w-24 items-center justify-center my-1">
                        {f.listening && (
                          <span
                            className="absolute inset-0 rounded-full bg-orange-500/20"
                            style={{ animation: 'ping 1.5s cubic-bezier(0,0,0.2,1) infinite' }}
                          />
                        )}
                        <button
                          onClick={() => f.listening && f.demoReply('I am awake, all clear.')}
                          className="relative z-10 flex h-16 w-16 cursor-pointer items-center justify-center rounded-full shadow-xl transition-transform active:scale-95"
                          style={{
                            background: f.listening ? '#f97316' : 'var(--bg-3)',
                          }}
                        >
                          {f.listening ? <Mic size={24} className="text-white" /> : <MicOff size={20} style={{ color: 'var(--text-4)' }} />}
                        </button>
                      </div>

                      <p className="text-[11px] font-bold" style={{ color: f.listening ? 'var(--orange)' : 'var(--text-4)' }}>
                        {f.listening ? '🎙 Listening — reply out loud' : 'Warming mic…'}
                      </p>

                      {/* Timer Bar */}
                      <div className="w-full">
                        <div className="mb-1 flex items-center justify-between">
                          <span className="text-[10px] font-semibold" style={{ color: 'var(--text-4)' }}>Response Timer</span>
                          <span className="text-xl font-black tabular-nums" style={{ color: timerColor }}>
                            {f.elapsed.toFixed(1)}s
                          </span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: 'var(--bg-3)' }}>
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${pct}%`,
                              backgroundColor: timerColor,
                              transition: 'width 0.1s linear, background-color 0.4s ease',
                            }}
                          />
                        </div>
                      </div>

                      {/* Demo Fallback */}
                      {!f.micSupported && (
                        <div className="w-full rounded-xl p-3 text-left border" style={{ background: 'var(--bg-2)', borderColor: 'var(--border)' }}>
                          <p className="mb-1.5 text-[11px] font-bold" style={{ color: 'var(--text-2)' }}>Simulate response:</p>
                          <div className="flex gap-2">
                            <button
                              onClick={() => f.demoReply("I'm fine, still driving.")}
                              className="cursor-pointer rounded-lg bg-green-600 px-3 py-1.5 text-[11px] font-bold text-white shadow-md hover:bg-green-500"
                            >
                              ✓ Instant reply
                            </button>
                            <button
                              onClick={() => f.simulateDelayedReply('Yeah… here.', 6000)}
                              className="cursor-pointer rounded-lg bg-amber-600 px-3 py-1.5 text-[11px] font-bold text-white shadow-md hover:bg-amber-500"
                            >
                              ⏱ Delay (6s)
                            </button>
                            <button
                              onClick={() => f.forceTimeout()}
                              className="cursor-pointer rounded-lg border border-red-500/30 px-3 py-1.5 text-[11px] font-bold text-red-500 hover:bg-red-500/10"
                            >
                              ✕ Timeout
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  {/* Latency Result */}
                  {analyzing && f.lastLatency && (
                    <div
                      className="w-full rounded-xl border p-3 text-left shadow-sm"
                      style={{ borderColor: `${f.lastLatency.color}55`, backgroundColor: `${f.lastLatency.color}10` }}
                    >
                      <div className="flex items-center justify-between text-[10px] font-bold" style={{ color: f.lastLatency.color }}>
                        <span>LATENCY ANALYSIS</span>
                        <span>{f.lastLatency.label}</span>
                      </div>
                      <div className="mt-0.5 text-2xl font-black" style={{ color: f.lastLatency.color }}>
                        {f.lastLatency.latency.toFixed(1)} <span className="text-xs font-semibold">sec</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer Session Controls */}
            <div className="flex items-center gap-2 border-t pt-3 shrink-0" style={{ borderColor: 'var(--border)' }}>
              {f.phase === 'idle' ? (
                <PillButton variant="black" className="flex-1 py-2 text-xs font-black" onClick={f.start}>
                  <Play size={14} /> Start Session
                </PillButton>
              ) : (
                <>
                  {f.phase === 'paused' ? (
                    <PillButton variant="black" className="flex-1 py-2 text-xs font-black" onClick={f.resume}>
                      <Play size={14} /> Resume Monitor
                    </PillButton>
                  ) : (
                    <PillButton variant="grey" className="flex-1 py-2 text-xs font-black" onClick={f.pause}>
                      <Pause size={14} /> Pause
                    </PillButton>
                  )}
                  <PillButton variant="grey" className="py-2" onClick={f.stop} title="Stop monitoring">
                    <Square size={14} />
                  </PillButton>
                  <PillButton variant="outline" className="py-2" onClick={f.stop} title="Exit Sleep Drive">
                    <Power size={14} />
                  </PillButton>
                </>
              )}
            </div>
          </section>

          {/* ────────────── SIDE CONTROLS COLUMN (5 cols) ────────────── */}
          <aside className="lg:col-span-5 flex flex-col justify-between gap-3 min-h-0 overflow-hidden">

            {/* Driving status */}
            <section className="rounded-2xl p-3.5 shadow-sm border shrink-0" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
              <div className="flex items-center justify-between">
                <SectionLabel>Driver Attention State</SectionLabel>
                <RiskBadge
                  level={escalation === 0 ? 'SAFE' : escalation === 1 ? 'MODERATE' : escalation === 2 ? 'HIGH' : 'CRITICAL'}
                />
              </div>
              <div className="mt-2 flex items-center justify-around">
                <ScoreGauge score={Math.round(f.state.fatigue_confidence * 1.04)} size={85} label="Confidence" />
                <div className="flex flex-col gap-1.5 text-center">
                  <div className="rounded-xl px-4 py-1.5 border" style={{ background: 'var(--bg-2)', borderColor: 'var(--border)' }}>
                    <div className="text-base font-extrabold" style={{ color: 'var(--text)' }}>{f.state.slow_responses}</div>
                    <div className="text-[9px] font-extrabold uppercase tracking-wider" style={{ color: 'var(--text-4)' }}>Slow Replies</div>
                  </div>
                  <div className="rounded-xl px-4 py-1.5 border" style={{ background: 'var(--bg-2)', borderColor: 'var(--border)' }}>
                    <div className="text-base font-extrabold" style={{ color: 'var(--text)' }}>{f.state.missed_responses}</div>
                    <div className="text-[9px] font-extrabold uppercase tracking-wider" style={{ color: 'var(--text-4)' }}>Missed Replies</div>
                  </div>
                </div>
              </div>
            </section>

            {/* Escalation Matrix */}
            <section className="rounded-2xl p-3.5 shadow-sm border flex-1 min-h-0 flex flex-col justify-between" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
              <SectionLabel>Escalation Matrix</SectionLabel>
              <div className="mt-2 space-y-1.5 flex-1 flex flex-col justify-between">
                {ESCALATION_STEPS.map((s) => (
                  <div
                    key={s.level}
                    className="flex items-center gap-2.5 rounded-xl p-2 border transition-all"
                    style={{
                      background: escalation === s.level ? 'var(--bg-2)' : 'transparent',
                      borderColor: escalation === s.level ? s.color : 'var(--border)',
                    }}
                  >
                    <span
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-black text-white"
                      style={{ backgroundColor: escalation >= s.level ? s.color : '#a3a3a3' }}
                    >
                      {s.level}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] font-bold truncate" style={{ color: 'var(--text)' }}>{s.label}</div>
                      <div className="text-[9px] truncate" style={{ color: 'var(--text-4)' }}>{s.desc}</div>
                    </div>
                    {escalation === s.level && <Gauge size={14} style={{ color: s.color }} />}
                  </div>
                ))}
              </div>
            </section>

            {/* Assistant & Audio Parameters */}
            <section className="rounded-2xl p-3.5 shadow-sm border space-y-2.5 shrink-0" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
              <SectionLabel>Assistant Settings</SectionLabel>
              
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-bold" style={{ color: 'var(--text)' }}>
                  <Sparkles size={13} className="text-violet-500" /> AI Gemini Conversation
                </div>
                <button
                  onClick={() => f.setAi(!f.aiEnabled)}
                  className={`relative h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors ${f.aiEnabled ? 'bg-violet-600' : 'bg-neutral-500'}`}
                >
                  <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${f.aiEnabled ? 'left-[18px]' : 'left-0.5'}`} />
                </button>
              </div>

              <div className="flex items-center justify-between border-t pt-2" style={{ borderColor: 'var(--border)' }}>
                <span className="flex items-center gap-1.5 text-xs font-bold" style={{ color: 'var(--text)' }}>
                  <Volume2 size={13} style={{ color: 'var(--text-3)' }} /> Text-To-Speech (TTS)
                </span>
                <button
                  onClick={() => f.setTts(!f.ttsEnabled)}
                  className={`relative h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors ${f.ttsEnabled ? 'bg-orange-500' : 'bg-neutral-500'}`}
                >
                  <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${f.ttsEnabled ? 'left-[18px]' : 'left-0.5'}`} />
                </button>
              </div>

              <div className="border-t pt-2" style={{ borderColor: 'var(--border)' }}>
                <div className="flex items-center justify-between text-xs font-bold" style={{ color: 'var(--text)' }}>
                  <span className="flex items-center gap-1.5">
                    <Music4 size={13} style={{ color: 'var(--text-3)' }} /> Ambient Alert Volume
                  </span>
                  <span className="text-[9px]" style={{ color: 'var(--text-4)' }}>Auto-rises at L2</span>
                </div>
                <input
                  type="range" min={0} max={1} step={0.05} defaultValue={0.12}
                  onChange={(e) => f.setMusicVolume(Number(e.target.value))}
                  className="mt-1 w-full accent-orange-500 cursor-pointer h-1"
                />
              </div>
            </section>

          </aside>
        </div>
      </div>

      {/* Critical Fatigue Overlay */}
      {critical && (
        <div className="fixed inset-0 z-[1500] flex items-center justify-center bg-red-950/90 p-4 backdrop-blur-sm">
          <div className="alert-flash w-full max-w-md rounded-3xl border-2 border-red-400 bg-red-950 p-6 text-center text-white">
            <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-red-600">
              <Siren size={32} className="animate-pulse" />
            </div>
            <h2 className="text-2xl font-black tracking-tight text-red-400">CRITICAL FATIGUE DETECTED</h2>
            <p className="mt-2 text-xs leading-relaxed opacity-90">
              No response recorded. Pull over immediately at the nearest safe spot.
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <PillButton variant="black" onClick={f.recover}>
                <Power size={14} /> I'm Awake — Dismiss
              </PillButton>
              <div className="flex gap-2">
                <PillButton variant="red" className="flex-1" onClick={() => window.open('tel:112')}>
                  <PhoneCall size={14} /> Call 112
                </PillButton>
                <PillButton variant="outline" className="flex-1" onClick={onGoEmergency}>
                  Emergency Mode <ArrowRight size={14} />
                </PillButton>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
