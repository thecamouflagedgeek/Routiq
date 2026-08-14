import type { ReactNode } from 'react'
import { RISK_META } from '../config'
import type { RiskLevel } from '../types'

export function DataBadge({ source, className = '' }: { source: 'live' | 'demo'; className?: string }) {
  const live = source === 'live'
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-bold tracking-widest ${
        live
          ? 'border-green-200 bg-green-50 text-green-700 dark:border-green-900 dark:bg-green-950 dark:text-green-400'
          : 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-400'
      } ${className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full pulse-dot ${live ? 'bg-green-500' : 'bg-amber-500'}`} />
      {live ? 'LIVE DATA' : 'DEMO DATA'}
    </span>
  )
}

export function RiskBadge({ level, className = '' }: { level: RiskLevel; className?: string }) {
  const meta = RISK_META[level]
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold tracking-widest ${className}`}
      style={{ backgroundColor: `${meta.color}1a`, color: meta.color }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: meta.color }} />
      {meta.label}
    </span>
  )
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div
      className="text-[10px] font-semibold uppercase tracking-[0.16em]"
      style={{ color: 'var(--text-4)' }}
    >
      {children}
    </div>
  )
}

export function ScoreGauge({
  score,
  size = 92,
  label,
}: {
  score: number
  size?: number
  label?: string
}) {
  const meta = RISK_META[score >= 80 ? 'SAFE' : score >= 60 ? 'MODERATE' : score >= 45 ? 'HIGH' : 'CRITICAL']
  const r = (size - 12) / 2
  const circ = 2 * Math.PI * r
  const filled = (score / 100) * circ
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--bg-3)" strokeWidth={9} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={meta.color}
          strokeWidth={9}
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circ}`}
          style={{ transition: 'stroke-dasharray 0.8s cubic-bezier(0.2,0.8,0.3,1)' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-2">
        <span className="text-xl font-black leading-none" style={{ color: 'var(--text)' }}>{score}</span>
        {label && (
          <span className="mt-0.5 text-[8px] font-bold uppercase tracking-wider leading-tight max-w-[70px] truncate" style={{ color: 'var(--text-4)' }}>
            {label}
          </span>
        )}
      </div>
    </div>
  )
}

export function Spinner({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  )
}

export function PillButton({
  children,
  onClick,
  variant = 'black',
  className = '',
  disabled,
  title,
}: {
  children: ReactNode
  onClick?: () => void
  variant?: 'black' | 'grey' | 'outline' | 'red'
  className?: string
  disabled?: boolean
  title?: string
}) {
  const styleMap: Record<string, React.CSSProperties> = {
    black: { background: 'var(--text)', color: 'var(--bg)' },
    grey: { background: 'var(--bg-3)', color: 'var(--text)' },
    outline: { border: '1px solid var(--border)', color: 'var(--text)', background: 'var(--surface)' },
    red: { background: '#dc2626', color: '#fff' },
  }
  return (
    <button
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex cursor-pointer items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      style={styleMap[variant]}
    >
      {children}
    </button>
  )
}
