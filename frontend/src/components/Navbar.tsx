import { useState } from 'react'
import { Menu, Moon, ShieldCheck, Siren, Sun, X } from 'lucide-react'

export type Page = 'dashboard' | 'sleep' | 'emergency'

const LINKS: { id: Page; label: string }[] = [
  { id: 'dashboard', label: 'Navigate' },
  { id: 'sleep', label: 'Sleep Drive' },
  { id: 'emergency', label: 'Emergency' },
]

export function Navbar({
  page,
  onNavigate,
  onReportHazard,
  dark,
  onToggleDark,
}: {
  page: Page
  onNavigate: (p: Page) => void
  onReportHazard: () => void
  dark: boolean
  onToggleDark: () => void
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  return (
    <>
      {/* ── Top Floating Brand Badge (Centered) ── */}
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[1100] hidden md:flex items-center gap-2.5 rounded-2xl px-5 py-2 shadow-xl backdrop-blur-md transition-all"
        style={{
          background: dark ? 'rgba(18, 18, 21, 0.85)' : 'rgba(255, 255, 255, 0.9)',
          border: dark ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid rgba(0, 0, 0, 0.08)',
        }}
      >
        <span
          className="flex h-7 w-7 items-center justify-center rounded-full shadow-inner"
          style={{ background: 'var(--text)' }}
        >
          <ShieldCheck size={15} style={{ color: 'var(--orange)' }} />
        </span>
        <span className="text-lg font-black tracking-tight" style={{ color: 'var(--text)' }}>
          Routiq<span style={{ color: 'var(--orange)' }}>.</span>
          <span className="ml-1.5 text-[10px] font-extrabold uppercase tracking-widest opacity-60">
            SAFEAI
          </span>
        </span>
      </div>

      {/* ── Bottom Floating Automotive Dock Bar (Always Centered) ── */}
      <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[1100] hidden md:flex justify-center items-center pointer-events-none px-4 transition-all">
        <div className="pointer-events-auto flex items-center gap-3 p-1.5 rounded-3xl shadow-2xl backdrop-blur-xl transition-all"
          style={{
            background: dark ? 'rgba(18, 18, 21, 0.88)' : 'rgba(255, 255, 255, 0.92)',
            border: dark ? '1px solid rgba(255, 255, 255, 0.12)' : '1px solid rgba(0, 0, 0, 0.08)',
          }}
        >
          {/* Main Navigation Tabs */}
          <nav className="flex items-center gap-1">
            {LINKS.map((l) => {
              const active = page === l.id
              return (
                <button
                  key={l.id}
                  onClick={() => onNavigate(l.id)}
                  className="cursor-pointer rounded-2xl px-5 py-2 text-sm font-extrabold transition-all"
                  style={
                    active
                      ? {
                          background: 'var(--orange)',
                          color: '#ffffff',
                          boxShadow: '0 4px 14px rgba(249, 115, 22, 0.4)',
                        }
                      : {
                          color: dark ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.7)',
                          background: 'transparent',
                        }
                  }
                >
                  {l.label}
                </button>
              )
            })}
          </nav>

          <div className="h-5 w-px opacity-20" style={{ background: 'var(--text)' }} />

          {/* Action Buttons */}
          <button
            onClick={onReportHazard}
            className="cursor-pointer rounded-2xl px-4 py-2 text-xs font-bold transition-all hover:opacity-80"
            style={{
              background: dark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.05)',
              color: 'var(--text)',
              border: dark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid rgba(0, 0, 0, 0.06)',
            }}
          >
            Report hazard
          </button>

          <button
            onClick={() => onNavigate('emergency')}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-2xl px-4 py-2 text-xs font-black text-white transition-all shadow-md hover:bg-red-700"
            style={{ background: '#dc2626' }}
          >
            <Siren size={13} className="text-white" />
            Emergency
          </button>

          {/* Theme Toggle Button */}
          <button
            onClick={onToggleDark}
            className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-2xl transition-all hover:scale-105"
            style={{
              background: dark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
              color: 'var(--text)',
              border: dark ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid rgba(0, 0, 0, 0.06)',
            }}
            title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {dark ? <Sun size={15} /> : <Moon size={15} />}
          </button>
        </div>
      </div>

      {/* ── Mobile Navigation Header ── */}
      <header
        className="fixed inset-x-0 top-0 z-[1200] backdrop-blur-md transition-colors md:hidden"
        style={{
          background: dark ? 'rgba(18, 18, 21, 0.92)' : 'rgba(255, 255, 255, 0.92)',
          borderBottom: dark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid rgba(0, 0, 0, 0.08)',
        }}
      >
        <div className="flex h-14 items-center justify-between px-4">
          <button
            className="flex cursor-pointer items-center gap-2"
            onClick={() => onNavigate('dashboard')}
          >
            <span
              className="flex h-8 w-8 items-center justify-center rounded-full"
              style={{ background: 'var(--text)' }}
            >
              <ShieldCheck size={16} style={{ color: 'var(--orange)' }} />
            </span>
            <span className="text-lg font-black tracking-tight" style={{ color: 'var(--text)' }}>
              Routiq<span style={{ color: 'var(--orange)' }}>.</span>
              <span className="ml-1 text-[9px] font-bold uppercase tracking-widest opacity-60">
                SAFEAI
              </span>
            </span>
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={onToggleDark}
              className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl"
              style={{ background: 'var(--bg-3)', color: 'var(--text-2)' }}
            >
              {dark ? <Sun size={15} /> : <Moon size={15} />}
            </button>
            <button
              onClick={() => setMobileMenuOpen((v) => !v)}
              className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl"
              style={{ background: 'var(--bg-3)', color: 'var(--text)' }}
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div
            className="p-4 shadow-xl"
            style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}
          >
            <nav className="flex flex-col gap-2">
              {LINKS.map((l) => (
                <button
                  key={l.id}
                  onClick={() => { onNavigate(l.id); setMobileMenuOpen(false) }}
                  className="flex w-full cursor-pointer items-center justify-between rounded-xl px-4 py-3 text-left font-semibold transition-colors"
                  style={
                    page === l.id
                      ? { background: 'var(--orange)', color: '#ffffff' }
                      : { color: 'var(--text-3)' }
                  }
                >
                  {l.label}
                </button>
              ))}
              <button
                onClick={() => { onReportHazard(); setMobileMenuOpen(false) }}
                className="flex w-full cursor-pointer items-center justify-between rounded-xl px-4 py-3 text-left font-semibold transition-colors"
                style={{ color: 'var(--text-3)' }}
              >
                Report hazard
              </button>
              <button
                onClick={() => { onNavigate('emergency'); setMobileMenuOpen(false) }}
                className="mt-2 flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl py-3 font-bold text-white bg-red-600"
              >
                <Siren size={16} />
                Emergency Mode
              </button>
            </nav>
          </div>
        )}
      </header>
    </>
  )
}
