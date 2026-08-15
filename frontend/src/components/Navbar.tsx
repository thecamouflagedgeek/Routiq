import {
  Moon,
  Navigation,
  Plus,
  ShieldCheck,
  Siren,
  Sun,
  Waves,
} from "lucide-react";

export type Page = "dashboard" | "sleep" | "emergency";

const LINKS: { id: Page; label: string; icon: typeof Navigation }[] = [
  { id: "dashboard", label: "Navigate", icon: Navigation },
  { id: "sleep", label: "Sleep Drive", icon: Waves },
  { id: "emergency", label: "Emergency", icon: Siren },
];

export function Navbar({
  page,
  onNavigate,
  onReportHazard,
  dark,
  onToggleDark,
}: {
  page: Page;
  onNavigate: (p: Page) => void;
  onReportHazard: () => void;
  dark: boolean;
  onToggleDark: () => void;
}) {
  return (
    <>
      {/* ── Top Floating Brand Badge (Centered Desktop) ── */}
      <div
        className="fixed top-4 left-1/2 -translate-x-1/2 z-[1100] hidden md:flex items-center gap-2.5 rounded-2xl px-5 py-2 shadow-xl backdrop-blur-md transition-all"
        style={{
          background: dark
            ? "rgba(18, 18, 21, 0.85)"
            : "rgba(255, 255, 255, 0.9)",
          border: dark
            ? "1px solid rgba(255, 255, 255, 0.1)"
            : "1px solid rgba(0, 0, 0, 0.08)",
        }}
      >
        <span
          className="flex h-7 w-7 items-center justify-center rounded-full shadow-inner"
          style={{ background: "var(--text)" }}
        >
          <ShieldCheck size={15} style={{ color: "var(--orange)" }} />
        </span>
        <span
          className="text-lg font-black tracking-tight"
          style={{ color: "var(--text)" }}
        >
          Routiq<span style={{ color: "var(--orange)" }}>.</span>
          <span className="ml-1.5 text-[10px] font-extrabold uppercase tracking-widest opacity-60">
            SAFEAI
          </span>
        </span>
      </div>

      {/* ── Desktop Bottom Floating Dock Bar ── */}
      <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[1100] hidden md:flex justify-center items-center pointer-events-none px-4 transition-all">
        <div
          className="pointer-events-auto flex items-center gap-3 p-1.5 rounded-3xl shadow-2xl backdrop-blur-xl transition-all"
          style={{
            background: dark
              ? "rgba(18, 18, 21, 0.88)"
              : "rgba(255, 255, 255, 0.92)",
            border: dark
              ? "1px solid rgba(255, 255, 255, 0.12)"
              : "1px solid rgba(0, 0, 0, 0.08)",
          }}
        >
          {/* Main Navigation Tabs */}
          <nav className="flex items-center gap-1">
            {LINKS.map((l) => {
              const active = page === l.id;
              return (
                <button
                  key={l.id}
                  onClick={() => onNavigate(l.id)}
                  className="cursor-pointer rounded-2xl px-5 py-2 text-sm font-extrabold transition-all"
                  style={
                    active
                      ? {
                          background: "var(--orange)",
                          color: "#ffffff",
                          boxShadow: "0 4px 14px rgba(249, 115, 22, 0.4)",
                        }
                      : {
                          color: dark
                            ? "rgba(255, 255, 255, 0.7)"
                            : "rgba(0, 0, 0, 0.7)",
                          background: "transparent",
                        }
                  }
                >
                  {l.label}
                </button>
              );
            })}
          </nav>

          <div
            className="h-5 w-px opacity-20"
            style={{ background: "var(--text)" }}
          />

          {/* Action Buttons */}
          <button
            onClick={onReportHazard}
            className="cursor-pointer rounded-2xl px-4 py-2 text-xs font-bold transition-all hover:opacity-80"
            style={{
              background: dark
                ? "rgba(255, 255, 255, 0.06)"
                : "rgba(0, 0, 0, 0.05)",
              color: "var(--text)",
              border: dark
                ? "1px solid rgba(255, 255, 255, 0.08)"
                : "1px solid rgba(0, 0, 0, 0.06)",
            }}
          >
            Report hazard
          </button>

          <button
            onClick={() => onNavigate("emergency")}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-2xl px-4 py-2 text-xs font-black text-white transition-all shadow-md hover:bg-red-700"
            style={{ background: "#dc2626" }}
          >
            <Siren size={13} className="text-white" />
            Emergency
          </button>

          {/* Theme Toggle Button */}
          <button
            onClick={onToggleDark}
            className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-2xl transition-all hover:scale-105"
            style={{
              background: dark
                ? "rgba(255, 255, 255, 0.08)"
                : "rgba(0, 0, 0, 0.06)",
              color: "var(--text)",
              border: dark
                ? "1px solid rgba(255, 255, 255, 0.1)"
                : "1px solid rgba(0, 0, 0, 0.06)",
            }}
            title={dark ? "Switch to light mode" : "Switch to dark mode"}
          >
            {dark ? <Sun size={15} /> : <Moon size={15} />}
          </button>
        </div>
      </div>

      {/* ── Mobile Top Header (Uber Style Compact Bar) ── */}
      <header
        className="fixed inset-x-0 top-0 z-[1200] backdrop-blur-md transition-colors md:hidden"
        style={{
          background: dark
            ? "rgba(18, 18, 21, 0.85)"
            : "rgba(255, 255, 255, 0.88)",
          borderBottom: dark
            ? "1px solid rgba(255, 255, 255, 0.08)"
            : "1px solid rgba(0, 0, 0, 0.08)",
        }}
      >
        <div className="flex h-12 items-center justify-between px-3.5">
          <button
            className="flex cursor-pointer items-center gap-2"
            onClick={() => onNavigate("dashboard")}
          >
            <span
              className="flex h-7 w-7 items-center justify-center rounded-full"
              style={{ background: "var(--text)" }}
            >
              <ShieldCheck size={14} style={{ color: "var(--orange)" }} />
            </span>
            <span
              className="text-base font-black tracking-tight"
              style={{ color: "var(--text)" }}
            >
              Routiq<span style={{ color: "var(--orange)" }}>.</span>
              <span className="ml-1 text-[8px] font-bold uppercase tracking-widest opacity-60">
                SAFEAI
              </span>
            </span>
          </button>

          <div className="flex items-center gap-1.5">
            <button
              onClick={onReportHazard}
              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border shadow-sm"
              style={{
                background: "var(--surface)",
                borderColor: "var(--border)",
                color: "var(--text)",
              }}
              title="Report hazard"
            >
              <Plus size={15} />
            </button>
            <button
              onClick={onToggleDark}
              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border shadow-sm"
              style={{
                background: "var(--surface)",
                borderColor: "var(--border)",
                color: "var(--text)",
              }}
            >
              {dark ? <Sun size={14} /> : <Moon size={14} />}
            </button>
          </div>
        </div>
      </header>

      {/* ── Mobile Floating Bottom Dock (Uber App Style - Inspiration Image 1) ── */}
      <div className="fixed bottom-3 inset-x-3 z-[1200] md:hidden flex justify-center items-center pointer-events-none">
        <div
          className="pointer-events-auto flex items-center justify-around w-full max-w-sm p-1.5 rounded-2xl shadow-2xl backdrop-blur-xl transition-all"
          style={{
            background: dark
              ? "rgba(18, 18, 21, 0.92)"
              : "rgba(255, 255, 255, 0.95)",
            border: dark
              ? "1px solid rgba(255, 255, 255, 0.12)"
              : "1px solid rgba(0, 0, 0, 0.1)",
          }}
        >
          {LINKS.map((l) => {
            const active = page === l.id;
            const Icon = l.icon;
            return (
              <button
                key={l.id}
                onClick={() => onNavigate(l.id)}
                className="flex flex-col items-center justify-center py-1 px-3 rounded-xl transition-all cursor-pointer min-w-[70px]"
                style={
                  active
                    ? {
                        background: "var(--orange)",
                        color: "#ffffff",
                        boxShadow: "0 3px 10px rgba(249, 115, 22, 0.35)",
                      }
                    : {
                        color: dark
                          ? "rgba(255, 255, 255, 0.65)"
                          : "rgba(0, 0, 0, 0.6)",
                        background: "transparent",
                      }
                }
              >
                <Icon size={17} className={active ? "text-white" : ""} />
                <span className="text-[10px] font-extrabold mt-0.5 tracking-tight">
                  {l.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
