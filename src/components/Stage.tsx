import { memo, useMemo } from 'react'

/** Fondo de plató: degradados, focos, suelo luminoso y partículas. */
export const Stage = memo(function Stage({ hue = 0, flash }: { hue?: number; flash?: 'correct' | 'wrong' | null }) {
  const particles = useMemo(
    () =>
      Array.from({ length: 28 }, (_, i) => ({
        left: `${(i * 37.7) % 100}%`,
        top: `${(i * 53.3 + 11) % 100}%`,
        d: `${5 + ((i * 7) % 6)}s`,
        delay: `${(i * 0.73) % 6}s`,
        s: i % 5 === 0 ? 4 : i % 3 === 0 ? 2 : 3,
      })),
    [],
  )
  return (
    <div className="stage" style={{ ['--stage-hue' as string]: `${hue}deg` }} aria-hidden="true">
      <div className="stage__beam" />
      <div className="stage__beam" />
      <div className="stage__beam" />
      <div className="stage__ring" />
      <div className="stage__floor" />
      {particles.map((p, i) => (
        <span
          key={i}
          className="stage__particle"
          style={{
            left: p.left,
            top: p.top,
            width: p.s,
            height: p.s,
            ['--d' as string]: p.d,
            ['--delay' as string]: p.delay,
          }}
        />
      ))}
      <div
        className="stage__flash"
        style={{
          opacity: flash ? 1 : 0,
          transition: 'opacity 0.6s ease',
          background:
            flash === 'correct'
              ? 'radial-gradient(70% 55% at 50% 55%, rgba(55,217,0,0.35), transparent 70%)'
              : flash === 'wrong'
                ? 'radial-gradient(70% 55% at 50% 55%, rgba(229,34,53,0.35), transparent 70%)'
                : 'none',
        }}
      />
    </div>
  )
})
