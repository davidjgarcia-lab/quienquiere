import { useId } from 'react'

/** Emblema original: medallón dorado con anillo de compromiso y destellos. */
export function Emblem({ size = 160, animated = true }: { size?: number; animated?: boolean }) {
  const id = useId().replace(/:/g, '')
  const gold = `gold-${id}`
  const goldV = `goldv-${id}`
  const bg = `bg-${id}`
  const gem = `gem-${id}`
  const glow = `glow-${id}`
  const ticks = Array.from({ length: 48 })
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" aria-hidden="true" className="overflow-visible">
      <defs>
        <linearGradient id={gold} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FFF4C2" />
          <stop offset="0.35" stopColor="#FFD966" />
          <stop offset="0.6" stopColor="#F8BD32" />
          <stop offset="0.85" stopColor="#A86E06" />
          <stop offset="1" stopColor="#FFE8A0" />
        </linearGradient>
        <linearGradient id={goldV} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFF4C2" />
          <stop offset="0.5" stopColor="#F8BD32" />
          <stop offset="1" stopColor="#8F5C04" />
        </linearGradient>
        <radialGradient id={bg} cx="50%" cy="40%" r="60%">
          <stop offset="0" stopColor="#3b1590" />
          <stop offset="0.6" stopColor="#13105a" />
          <stop offset="1" stopColor="#050B35" />
        </radialGradient>
        <linearGradient id={gem} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.45" stopColor="#c9ecff" />
          <stop offset="0.7" stopColor="#7cc4f0" />
          <stop offset="1" stopColor="#ffffff" />
        </linearGradient>
        <filter id={glow} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* halo */}
      <circle cx="100" cy="100" r="98" fill="none" stroke="#FFD966" strokeOpacity="0.25" strokeWidth="6" filter={`url(#${glow})`} />
      {/* medallón */}
      <circle cx="100" cy="100" r="92" fill={`url(#${bg})`} stroke={`url(#${gold})`} strokeWidth="5" />
      <g className={animated ? 'origin-center animate-[spin_40s_linear_infinite]' : ''} style={{ transformBox: 'fill-box' }}>
        {ticks.map((_, i) => (
          <line
            key={i}
            x1="100"
            y1="13"
            x2="100"
            y2={i % 4 === 0 ? 23 : 18}
            stroke="#FFD966"
            strokeOpacity={i % 4 === 0 ? 0.9 : 0.45}
            strokeWidth={i % 4 === 0 ? 2 : 1}
            transform={`rotate(${(360 / ticks.length) * i} 100 100)`}
          />
        ))}
      </g>
      <circle cx="100" cy="100" r="72" fill="none" stroke="#087BCB" strokeOpacity="0.6" strokeWidth="1.5" />
      <circle cx="100" cy="100" r="66" fill="none" stroke={`url(#${gold})`} strokeOpacity="0.5" strokeWidth="1" strokeDasharray="2 5" />

      {/* rayos de luz detrás del anillo */}
      <g opacity="0.55">
        {Array.from({ length: 12 }).map((_, i) => (
          <path
            key={i}
            d="M100 100 L96 40 L104 40 Z"
            fill="#FFD966"
            fillOpacity="0.25"
            transform={`rotate(${i * 30} 100 100)`}
          />
        ))}
      </g>

      {/* anillo */}
      <g filter={`url(#${glow})`}>
        <ellipse cx="100" cy="118" rx="36" ry="33" fill="none" stroke={`url(#${goldV})`} strokeWidth="10" />
        <ellipse cx="100" cy="118" rx="36" ry="33" fill="none" stroke="#FFF4C2" strokeOpacity="0.6" strokeWidth="2" />
        {/* engarce */}
        <path d="M86 88 L92 80 L108 80 L114 88 L104 92 L96 92 Z" fill={`url(#${gold})`} />
        {/* diamante */}
        <path d="M78 62 L88 48 L112 48 L122 62 L100 88 Z" fill={`url(#${gem})`} stroke="#fff" strokeWidth="1.5" />
        <path
          d="M78 62 H122 M88 48 L94 62 L100 88 M112 48 L106 62 L100 88 M94 62 L100 48 L106 62"
          fill="none"
          stroke="#5aaee0"
          strokeWidth="1"
          strokeOpacity="0.9"
        />
      </g>
      {/* destellos */}
      <g fill="#fff">
        <path d="M128 44 l2 6 6 2 -6 2 -2 6 -2 -6 -6 -2 6 -2z" className={animated ? 'animate-pulse' : ''} />
        <path d="M70 52 l1.4 4 4 1.4 -4 1.4 -1.4 4 -1.4 -4 -4 -1.4 4 -1.4z" opacity="0.8" />
      </g>
      {/* corazones */}
      <path d="M58 132 c-4 -6 4 -10 6 -4 c2 -6 10 -2 6 4 l-6 6z" fill="#FF6FA3" opacity="0.85" />
      <path d="M136 132 c-4 -6 4 -10 6 -4 c2 -6 10 -2 6 4 l-6 6z" fill="#FF6FA3" opacity="0.85" />
    </svg>
  )
}

interface LogoProps {
  variant?: 'hero' | 'compact' | 'inline'
  animated?: boolean
}

export function Logo({ variant = 'hero', animated = true }: LogoProps) {
  if (variant === 'inline') {
    return (
      <div className="flex items-center gap-2.5">
        <Emblem size={40} animated={false} />
        <div className="leading-none">
          <div className="font-display text-[0.62rem] font-bold tracking-[0.2em] text-white/80">¿QUIÉN QUIERE</div>
          <div className="font-display text-sm font-black tracking-wider text-gold-grad">CASARSE CON ADRI?</div>
        </div>
      </div>
    )
  }

  const hero = variant === 'hero'
  return (
    <div className="flex flex-col items-center text-center select-none">
      <Emblem size={hero ? 168 : 76} animated={animated} />
      <div className={hero ? '-mt-3' : '-mt-1.5'}>
        <div
          className={`font-display font-extrabold tracking-[0.28em] text-white text-glow ${
            hero ? 'text-base sm:text-xl' : 'text-[0.6rem]'
          }`}
        >
          ¿QUIÉN QUIERE
        </div>
        <div
          className={`font-display font-black leading-[0.95] text-gold-grad ${
            hero ? 'text-[2.6rem] sm:text-6xl drop-shadow-[0_3px_0_rgba(0,0,0,0.35)]' : 'text-xl'
          }`}
        >
          CASARSE
        </div>
        <div className="flex items-center justify-center gap-2">
          <span className={`h-px bg-gradient-to-r from-transparent to-gold ${hero ? 'w-10 sm:w-16' : 'w-5'}`} />
          <span
            className={`font-display font-extrabold tracking-[0.18em] text-white text-glow ${
              hero ? 'text-xl sm:text-3xl' : 'text-[0.7rem]'
            }`}
          >
            CON ADRI?
          </span>
          <span className={`h-px bg-gradient-to-l from-transparent to-gold ${hero ? 'w-10 sm:w-16' : 'w-5'}`} />
        </div>
      </div>
    </div>
  )
}
