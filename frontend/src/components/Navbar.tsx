import { useState } from 'react'
import { Menu, ShieldCheck, Siren, X } from 'lucide-react'

export type Page = 'dashboard' | 'sleep' | 'emergency'

const LINKS: { id: Page; label: string }[] = [
  { id: 'dashboard', label: 'Ride' },
  { id: 'sleep', label: 'Drive' },
  { id: 'emergency', label: 'Emergency' },
]

export function Navbar({
  page,
  onNavigate,
  onReportHazard,
}: {
  page: Page
  onNavigate: (p: Page) => void
  onReportHazard: () => void
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  return (
    <header className="fixed inset-x-0 top-0 z-[1200] border-b border-neutral-200/60 bg-white/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-[1400px] items-center justify-between px-4 sm:px-8">
        {/* Brand / Logo */}
        <div className="flex items-center gap-8">
          <button
            className="flex cursor-pointer items-center gap-2"
            onClick={() => onNavigate('dashboard')}
            title="NexRoad AI"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-neutral-900">
              <ShieldCheck size={18} className="text-orange-500" />
            </span>
            <span className="text-2xl font-black tracking-tight text-neutral-900">
              Nex<span className="text-orange-500">Road</span>{' '}
              <span className="text-xs font-semibold uppercase tracking-widest text-neutral-400">SafeAI</span>
            </span>
          </button>

          {/* Navigation Pills (Desktop) */}
          <nav className="hidden items-center rounded-full bg-neutral-100/90 p-1 md:flex">
            {LINKS.map((l) => (
              <button
                key={l.id}
                onClick={() => onNavigate(l.id)}
                className={`cursor-pointer rounded-full px-5 py-1.5 text-sm font-semibold transition-all ${
                  page === l.id
                    ? 'bg-white text-neutral-900 shadow-sm'
                    : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                {l.label}
              </button>
            ))}
            <button
              onClick={onReportHazard}
              className="cursor-pointer rounded-full px-5 py-1.5 text-sm font-semibold text-neutral-600 transition-all hover:text-neutral-900"
            >
              More
            </button>
          </nav>
        </div>

        {/* Right CTA Actions */}
        <div className="hidden items-center gap-3 md:flex">
          <button
            onClick={onReportHazard}
            className="cursor-pointer rounded-full border border-neutral-200 bg-white px-4 py-2 text-xs font-bold text-neutral-800 transition-all hover:bg-neutral-100"
          >
            Report hazard
          </button>
          <button
            onClick={() => onNavigate('emergency')}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-neutral-900 px-5 py-2 text-xs font-bold text-white transition-all hover:bg-neutral-800 shadow-sm"
          >
            <Siren size={14} className="text-red-400" />
            Emergency
          </button>
        </div>

        {/* Mobile Hamburger Toggle */}
        <button
          onClick={() => setMobileMenuOpen((v) => !v)}
          className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-neutral-100 text-neutral-900 md:hidden"
          aria-label="Toggle menu"
        >
          {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* Mobile Drawer Navigation */}
      {mobileMenuOpen && (
        <div className="border-b border-neutral-200 bg-white p-4 shadow-xl md:hidden">
          <nav className="flex flex-col gap-2">
            {LINKS.map((l) => (
              <button
                key={l.id}
                onClick={() => {
                  onNavigate(l.id)
                  setMobileMenuOpen(false)
                }}
                className={`flex w-full cursor-pointer items-center justify-between rounded-xl px-4 py-3 text-left font-semibold ${
                  page === l.id ? 'bg-neutral-100 text-neutral-900' : 'text-neutral-600'
                }`}
              >
                {l.label}
              </button>
            ))}
            <button
              onClick={() => {
                onReportHazard()
                setMobileMenuOpen(false)
              }}
              className="flex w-full cursor-pointer items-center justify-between rounded-xl px-4 py-3 text-left font-semibold text-neutral-600 hover:bg-neutral-50"
            >
              Report hazard
            </button>
            <button
              onClick={() => {
                onNavigate('emergency')
                setMobileMenuOpen(false)
              }}
              className="mt-2 flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-neutral-900 py-3 font-bold text-white"
            >
              <Siren size={16} className="text-red-400" />
              Emergency Mode
            </button>
          </nav>
        </div>
      )}
    </header>
  )
}

