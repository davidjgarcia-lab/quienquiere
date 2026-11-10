import { useId } from 'react'
import type { LifelineKind } from '../lib/types'

export const LIFELINE_LABEL: Record<LifelineKind, string> = {
  fifty: '50:50',
  call: 'La llamada',
  challenge: 'La prueba',
}

function Badge({ children }: { children: React.ReactNode }) {
  const id = useId().replace(/:/g, '')
  return (
    <svg viewBox="0 0 100 100" className="h-full w-full overflow-visible" aria-hidden="true">
      <defs>
        <linearGradient id={`r${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FFF4C2" />
          <stop offset="0.45" stopColor="#F8BD32" />
          <stop offset="0.8" stopColor="#9C6405" />
          <stop offset="1" stopColor="#FFE08A" />
        </linearGradient>
        <radialGradient id={`f${id}`} cx="50%" cy="35%" r="70%">
          <stop offset="0" stopColor="#1f4fa8" />
          <stop offset="0.6" stopColor="#0a2266" />
          <stop offset="1" stopColor="#050B35" />
        </radialGradient>
      </defs>
      {/* hexágono exterior */}
      <path d="M50 2 L92 26 L92 74 L50 98 L8 74 L8 26 Z" fill={`url(#r${id})`} />
      <path d="M50 8 L87 29 L87 71 L50 92 L13 71 L13 29 Z" fill={`url(#f${id})`} />
      <circle cx="50" cy="50" r="33" fill="none" stroke="#9ed8ff" strokeOpacity="0.45" strokeWidth="1.2" />
      <path d="M22 30 Q50 14 78 30" fill="none" stroke="#fff" strokeOpacity="0.18" strokeWidth="6" strokeLinecap="round" />
      {children}
    </svg>
  )
}

export function LifelineGlyph({ kind }: { kind: LifelineKind }) {
  if (kind === 'fifty')
    return (
      <Badge>
        <text x="50" y="58" textAnchor="middle" fontFamily="Montserrat, sans-serif" fontWeight="900" fontSize="24" fill="#FFD966" letterSpacing="-0.5">
          50:50
        </text>
        <path d="M30 70 H70" stroke="#FFD966" strokeOpacity="0.6" strokeWidth="1.5" />
      </Badge>
    )
  if (kind === 'call')
    return (
      <Badge>
        <path
          d="M38 34c2-2 5-2 6 1l3 7c1 2 0 4-2 5l-3 2c2 5 6 9 11 11l2-3c1-2 3-3 5-2l7 3c3 1 3 4 1 6l-3 3c-3 3-8 4-12 2-10-5-17-12-22-22-2-4-1-9 2-12z"
          fill="#FFD966"
        />
        <path d="M58 30 q8 2 10 10" stroke="#FFD966" strokeWidth="3" fill="none" strokeLinecap="round" />
        <path d="M58 22 q15 3 18 18" stroke="#FFD966" strokeOpacity="0.6" strokeWidth="3" fill="none" strokeLinecap="round" />
        <path d="M30 70 c-3 -4 3 -7 4 -3 c1 -4 7 -1 4 3 l-4 4z" fill="#FF6FA3" />
      </Badge>
    )
  return (
    <Badge>
      <path d="M50 22 L57 40 L76 41 L61 53 L66 72 L50 61 L34 72 L39 53 L24 41 L43 40 Z" fill="#FFD966" />
      <path d="M50 30 L54 42 L66 43 L56 50 L59 62 L50 55 L41 62 L44 50 L34 43 L46 42 Z" fill="#fff4c2" opacity="0.55" />
      <text x="50" y="56" textAnchor="middle" fontFamily="Montserrat, sans-serif" fontWeight="900" fontSize="16" fill="#3a1a00">
        !
      </text>
    </Badge>
  )
}

interface ButtonProps {
  kind: LifelineKind
  used: boolean
  active?: boolean
  disabled?: boolean
  onClick?: () => void
  size?: number
  showLabel?: boolean
}

export function LifelineButton({ kind, used, active, disabled, onClick, size = 74, showLabel = true }: ButtonProps) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <button
        type="button"
        className="lifeline"
        data-used={used && !active}
        disabled={disabled || used}
        onClick={onClick}
        style={{
          width: size,
          height: size,
          filter: active ? 'drop-shadow(0 0 16px rgba(255,148,30,0.95))' : used ? undefined : 'drop-shadow(0 0 10px rgba(248,189,50,0.45))',
        }}
        aria-label={`Comodín ${LIFELINE_LABEL[kind]}${used ? ' (utilizado)' : ''}`}
      >
        <span className="lifeline__glyph h-full w-full">
          <LifelineGlyph kind={kind} />
        </span>
        {used && !active && <span className="lifeline__cross" />}
      </button>
      {showLabel && (
        <span
          className={`text-[0.62rem] font-extrabold uppercase tracking-[0.16em] ${used ? 'text-white/35 line-through' : 'text-gold-light'}`}
        >
          {LIFELINE_LABEL[kind]}
        </span>
      )}
    </div>
  )
}
