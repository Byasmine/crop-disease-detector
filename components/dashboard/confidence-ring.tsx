import type { Status } from '@/lib/history'

export function ConfidenceRing({ value, status, size = 64 }: { value: number; status: Status; size?: number }) {
  const radius = 16
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (Math.min(100, Math.max(0, value)) / 100) * circumference
  const stroke =
    status === 'Sain' ? 'var(--success)' : status === 'À surveiller' ? 'var(--warning)' : 'var(--danger)'

  return (
    <svg width={size} height={size} viewBox="0 0 40 40" className="shrink-0 -rotate-90">
      <circle cx="20" cy="20" r={radius} fill="none" stroke="currentColor" strokeWidth="3" className="text-border" />
      <circle
        cx="20"
        cy="20"
        r={radius}
        fill="none"
        stroke={stroke}
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        style={{ animation: 'folium-draw 0.8s ease forwards' }}
      />
      <text
        x="20"
        y="20"
        dominantBaseline="central"
        textAnchor="middle"
        className="rotate-90 fill-foreground font-mono text-[7px] font-semibold"
        style={{ transformOrigin: '20px 20px', transform: 'rotate(90deg)' }}
      >
        {Math.round(value)}
      </text>
    </svg>
  )
}
