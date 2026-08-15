/**
 * DriveHUD — live navigation overlay shown during simulated drive.
 *
 * Shows:
 *   • Current segment score + risk reasons
 *   • Upcoming segment preview
 *   • Driver state (from useFatigue)
 *   • Fused contextual risk
 *   • Intervention banner when risk is critical
 */
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Brain,
  ChevronRight,
  Navigation,
  ShieldAlert,
  ShieldCheck,
  TrendingUp,
  Zap,
} from "lucide-react";
import { RISK_META, RISK_STATE_META } from "../config";
import type { DriverRiskState, RiskLevel, Segment } from "../types";
import type { SleepPhase } from "../hooks/useFatigue";
import type { FatigueState } from "../types";

// ─── Risk fusion ───────────────────────────────────────────────────────────

const RISK_ORDER: RiskLevel[] = ["SAFE", "MODERATE", "HIGH", "CRITICAL"];
const DRIVER_RISK: Record<DriverRiskState, number> = {
  NORMAL: 0,
  ATTENTION: 1,
  ELEVATED: 2,
  HIGH_CONCERN: 3,
};

function fuseRisk(roadRisk: RiskLevel, driverRisk: RiskLevel): RiskLevel {
  const ri = RISK_ORDER.indexOf(roadRisk);
  const di = RISK_ORDER.indexOf(driverRisk);
  const base = Math.max(ri, di);
  // elevate one level if both are HIGH or above
  if (ri >= 2 && di >= 2) return RISK_ORDER[Math.min(3, base + 1)];
  return RISK_ORDER[base];
}

// ─── Sub-components ────────────────────────────────────────────────────────

function ScorePill({ score, risk }: { score: number; risk: RiskLevel }) {
  const meta = RISK_META[risk];
  return (
    <div
      className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-full font-black shadow-sm"
      style={{
        background: `${meta.color}18`,
        border: `2px solid ${meta.color}`,
        color: meta.color,
      }}
    >
      <span className="text-base leading-none">{score}</span>
      <span className="text-[8px] leading-none opacity-70">/ 100</span>
    </div>
  );
}

function RiskChip({ level }: { level: RiskLevel }) {
  const meta = RISK_META[level];
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-widest"
      style={{ background: `${meta.color}18`, color: meta.color }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full pulse-dot"
        style={{ background: meta.color }}
      />
      {meta.label}
    </span>
  );
}

function TopFactors({ segment }: { segment: Segment }) {
  const top = segment.explanation.slice(0, 2);
  if (!top.length)
    return (
      <p className="text-[10px]" style={{ color: "var(--text-3)" }}>
        No major risk factors.
      </p>
    );
  return (
    <ul className="space-y-1">
      {top.map((e) => (
        <li key={e.factor} className="flex items-start gap-1.5">
          <AlertTriangle
            size={9}
            className="mt-0.5 shrink-0"
            style={{ color: "var(--orange)" }}
          />
          <span
            className="text-[10px] leading-snug"
            style={{ color: "var(--text-2)" }}
          >
            {e.factor}
          </span>
        </li>
      ))}
    </ul>
  );
}

// ─── Main export ───────────────────────────────────────────────────────────

interface DriveHUDProps {
  currentSegment: Segment | null;
  nextSegment: Segment | null;
  progress: number;
  demoPhase: 1 | 2 | 3;
  fatigueState: FatigueState;
  fatiguePhase: SleepPhase;
  onOpenEmergency: () => void;
}

export function DriveHUD({
  currentSegment,
  nextSegment,
  progress,
  demoPhase,
  fatigueState,
  onOpenEmergency,
}: DriveHUDProps) {
  const [showAllFactors, setShowAllFactors] = useState(false);

  // ── driver state (scripted demo progression) ──
  const driverData = useMemo(() => {
    // Override with scripted values tied to demo phase so the story is always clean.
    const base = DRIVER_RISK[fatigueState.state] ?? 0;

    if (demoPhase === 1) {
      return {
        engagement: 94,
        latency: 1.3,
        risk: "SAFE" as RiskLevel,
        label: "Alert",
        conf: Math.max(base * 12, 5),
      };
    }
    if (demoPhase === 2) {
      return {
        engagement: 72,
        latency: 4.2,
        risk: "MODERATE" as RiskLevel,
        label: "Mild concern",
        conf: Math.max(base * 18, 28),
      };
    }
    return {
      engagement: 58,
      latency: 5.8,
      risk: (base >= 2 ? "HIGH" : "MODERATE") as RiskLevel,
      label: base >= 2 ? "Elevated" : "Moderate",
      conf: Math.max(base * 22, 55),
    };
  }, [demoPhase, fatigueState.state]);

  const roadRisk: RiskLevel = currentSegment?.risk_level ?? "SAFE";
  const driverRisk: RiskLevel =
    RISK_STATE_META[fatigueState.state]?.riskLabel ?? driverData.risk;
  const contextualRisk = fuseRisk(roadRisk, driverRisk);
  const contextMeta = RISK_META[contextualRisk];
  const isIntervention =
    contextualRisk === "HIGH" || contextualRisk === "CRITICAL";

  if (!currentSegment) return null;

  return (
    <div className="pointer-events-none flex flex-col gap-2 w-full">
      {/* ── INTERVENTION BANNER ── */}
      {isIntervention && (
        <div
          className="pointer-events-auto intervention-slide rounded-2xl p-3 shadow-lg"
          style={{
            background: `${contextMeta.color}14`,
            border: `1.5px solid ${contextMeta.color}50`,
          }}
        >
          <div className="flex items-start gap-2.5">
            <div
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
              style={{ background: `${contextMeta.color}20` }}
            >
              <Zap size={13} style={{ color: contextMeta.color }} />
            </div>
            <div className="min-w-0 flex-1">
              <div
                className="text-[10px] font-black uppercase tracking-widest"
                style={{ color: contextMeta.color }}
              >
                System intervention
              </div>
              <p
                className="mt-0.5 text-[11px] font-semibold leading-snug"
                style={{ color: "var(--text)" }}
              >
                {contextualRisk === "CRITICAL"
                  ? "Your engagement is significantly reduced. Approaching a high-risk segment — consider stopping."
                  : "Your engagement is decreasing and you're approaching a high-risk road segment. Consider taking a break."}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── RISK FUSION ROW ── */}
      <div
        className="pointer-events-auto rounded-2xl p-3"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
        }}
      >
        <div className="mb-2 flex items-center gap-1.5">
          <Brain size={10} style={{ color: "var(--text-3)" }} />
          <span
            className="text-[9px] font-black uppercase tracking-widest"
            style={{ color: "var(--text-3)" }}
          >
            Contextual Risk
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* road */}
          <div
            className="flex-1 rounded-xl p-2"
            style={{ background: "var(--bg-2)" }}
          >
            <div
              className="text-[9px] font-semibold uppercase tracking-wider"
              style={{ color: "var(--text-4)" }}
            >
              Road
            </div>
            <RiskChip level={roadRisk} />
          </div>
          <ChevronRight
            size={12}
            style={{ color: "var(--text-4)", flexShrink: 0 }}
          />
          {/* driver */}
          <div
            className="flex-1 rounded-xl p-2"
            style={{ background: "var(--bg-2)" }}
          >
            <div
              className="text-[9px] font-semibold uppercase tracking-wider"
              style={{ color: "var(--text-4)" }}
            >
              Driver
            </div>
            <RiskChip level={driverRisk} />
          </div>
          <ChevronRight
            size={12}
            style={{ color: "var(--text-4)", flexShrink: 0 }}
          />
          {/* fused */}
          <div
            className="flex-1 rounded-xl p-2"
            style={{
              background: `${contextMeta.color}12`,
              border: `1px solid ${contextMeta.color}35`,
            }}
          >
            <div
              className="text-[9px] font-semibold uppercase tracking-wider"
              style={{ color: contextMeta.color }}
            >
              Fused
            </div>
            <RiskChip level={contextualRisk} />
          </div>
        </div>
      </div>

      {/* ── CURRENT SEGMENT ── */}
      <div
        className="pointer-events-auto rounded-2xl p-3"
        style={{
          background: "var(--surface)",
          border: `1.5px solid ${currentSegment.risk_color}30`,
        }}
      >
        <div className="flex items-start gap-3">
          <ScorePill
            score={currentSegment.safety_score}
            risk={currentSegment.risk_level}
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Navigation
                size={10}
                style={{ color: currentSegment.risk_color }}
              />
              <span
                className="text-[9px] font-black uppercase tracking-widest"
                style={{ color: "var(--text-3)" }}
              >
                Current Segment
              </span>
            </div>
            <div
              className="mt-0.5 truncate text-xs font-bold"
              style={{ color: "var(--text)" }}
            >
              {currentSegment.name}
            </div>
            <div className="mt-1">
              <RiskChip level={currentSegment.risk_level} />
            </div>
          </div>
        </div>

        {/* factors */}
        {currentSegment.risk_level !== "SAFE" && (
          <div
            className="mt-2.5 border-t pt-2"
            style={{ borderColor: "var(--border)" }}
          >
            <button
              className="pointer-events-auto mb-1.5 flex items-center gap-1 cursor-pointer"
              style={{ color: "var(--text-3)" }}
              onClick={() => setShowAllFactors((v) => !v)}
            >
              <AlertTriangle size={9} />
              <span className="text-[9px] font-black uppercase tracking-widest">
                Why risky? {showAllFactors ? "▲" : "▼"}
              </span>
            </button>
            {showAllFactors ? (
              <ul className="space-y-1">
                {currentSegment.explanation.map((e) => (
                  <li key={e.factor} className="flex items-start gap-1.5">
                    <AlertTriangle
                      size={9}
                      className="mt-0.5 shrink-0"
                      style={{ color: "var(--orange)" }}
                    />
                    <div>
                      <span
                        className="text-[10px] font-semibold leading-snug"
                        style={{ color: "var(--text)" }}
                      >
                        {e.factor}
                      </span>
                      <span
                        className="ml-1 text-[9px]"
                        style={{ color: "var(--text-3)" }}
                      >
                        {e.detail}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <TopFactors segment={currentSegment} />
            )}
          </div>
        )}
        {currentSegment.risk_level === "SAFE" && (
          <div className="mt-2 flex items-center gap-1.5">
            <ShieldCheck size={10} style={{ color: "var(--green)" }} />
            <span className="text-[10px]" style={{ color: "var(--text-3)" }}>
              No significant risk factors.
            </span>
          </div>
        )}
      </div>

      {/* ── UPCOMING SEGMENT ── */}
      {nextSegment && (
        <div
          className="pointer-events-auto rounded-2xl p-3"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
          }}
        >
          <div className="flex items-start gap-3">
            <div
              className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-full font-black text-sm"
              style={{
                background: `${nextSegment.risk_color}14`,
                border: `1.5px solid ${nextSegment.risk_color}`,
                color: nextSegment.risk_color,
              }}
            >
              {nextSegment.safety_score}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <TrendingUp size={9} style={{ color: "var(--text-3)" }} />
                <span
                  className="text-[9px] font-black uppercase tracking-widest"
                  style={{ color: "var(--text-3)" }}
                >
                  Upcoming — {(nextSegment.distance_km * 1000).toFixed(0)} m
                  ahead
                </span>
              </div>
              <div
                className="mt-0.5 truncate text-[11px] font-semibold"
                style={{ color: "var(--text-2)" }}
              >
                {nextSegment.name}
              </div>
              <div className="mt-1">
                <RiskChip level={nextSegment.risk_level} />
              </div>
            </div>
          </div>

          {(nextSegment.risk_level === "HIGH" ||
            nextSegment.risk_level === "CRITICAL") && (
            <div
              className="mt-2 rounded-xl p-2"
              style={{
                background: `${nextSegment.risk_color}10`,
                border: `1px solid ${nextSegment.risk_color}25`,
              }}
            >
              <div className="flex items-center gap-1 mb-1">
                <ShieldAlert
                  size={9}
                  style={{ color: nextSegment.risk_color }}
                />
                <span
                  className="text-[9px] font-bold uppercase tracking-wide"
                  style={{ color: nextSegment.risk_color }}
                >
                  Upcoming risk factors
                </span>
              </div>
              <TopFactors segment={nextSegment} />
            </div>
          )}
        </div>
      )}

      {/* ── DRIVER STATE ── */}
      <div
        className="pointer-events-auto rounded-2xl p-3"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
        }}
      >
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Brain size={10} style={{ color: "var(--text-3)" }} />
            <span
              className="text-[9px] font-black uppercase tracking-widest"
              style={{ color: "var(--text-3)" }}
            >
              Driver State
            </span>
          </div>
          <RiskChip level={driverData.risk} />
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          <div
            className="rounded-xl p-2 text-center"
            style={{ background: "var(--bg-2)" }}
          >
            <div
              className="text-base font-black"
              style={{ color: "var(--text)" }}
            >
              {driverData.engagement}%
            </div>
            <div
              className="text-[9px] font-semibold uppercase tracking-wider"
              style={{ color: "var(--text-4)" }}
            >
              Engagement
            </div>
          </div>
          <div
            className="rounded-xl p-2 text-center"
            style={{ background: "var(--bg-2)" }}
          >
            <div
              className="text-base font-black"
              style={{ color: "var(--text)" }}
            >
              {driverData.latency}s
            </div>
            <div
              className="text-[9px] font-semibold uppercase tracking-wider"
              style={{ color: "var(--text-4)" }}
            >
              Latency
            </div>
          </div>
          <div
            className="rounded-xl p-2 text-center"
            style={{ background: "var(--bg-2)" }}
          >
            <div
              className="text-base font-black"
              style={{ color: "var(--text)" }}
            >
              {fatigueState.missed_responses}
            </div>
            <div
              className="text-[9px] font-semibold uppercase tracking-wider"
              style={{ color: "var(--text-4)" }}
            >
              Missed
            </div>
          </div>
        </div>
        {/* progress bar */}
        <div className="mt-2">
          <div className="flex items-center justify-between mb-1">
            <span
              className="text-[9px] font-semibold"
              style={{ color: "var(--text-4)" }}
            >
              Route progress
            </span>
            <span
              className="text-[9px] font-bold"
              style={{ color: "var(--text-3)" }}
            >
              {Math.round(progress * 100)}%
            </span>
          </div>
          <div
            className="h-1.5 w-full overflow-hidden rounded-full"
            style={{ background: "var(--bg-3)" }}
          >
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${progress * 100}%`,
                background: "var(--orange)",
              }}
            />
          </div>
        </div>
      </div>

      {/* ── EMERGENCY ── */}
      <button
        className="pointer-events-auto w-full rounded-2xl py-2.5 text-xs font-black text-white shadow-md cursor-pointer transition-all active:scale-[0.98]"
        style={{ background: "#dc2626" }}
        onClick={onOpenEmergency}
      >
        🚨 SOS Emergency
      </button>
    </div>
  );
}
