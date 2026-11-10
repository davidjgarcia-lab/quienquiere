import { useEffect, useRef } from 'react'

/** Confeti ligero en canvas (sin dependencias). */
export function Confetti({ fire, duration = 3500, density = 160 }: { fire: unknown; duration?: number; density?: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    if (!fire) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const resize = () => {
      canvas.width = window.innerWidth * dpr
      canvas.height = window.innerHeight * dpr
    }
    resize()
    const colors = ['#FFD966', '#F8BD32', '#ffffff', '#FF6FA3', '#9ed8ff', '#37D900']
    const W = () => canvas.width
    const H = () => canvas.height
    const parts = Array.from({ length: density }, () => ({
      x: W() / 2 + (Math.random() - 0.5) * W() * 0.3,
      y: H() * 0.45,
      vx: (Math.random() - 0.5) * 18 * dpr,
      vy: (-Math.random() * 18 - 6) * dpr,
      r: (Math.random() * 6 + 4) * dpr,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
      c: colors[(Math.random() * colors.length) | 0],
      heart: Math.random() < 0.18,
    }))
    let raf = 0
    const start = performance.now()
    const tick = (t: number) => {
      const el = t - start
      ctx.clearRect(0, 0, W(), H())
      for (const p of parts) {
        p.vy += 0.45 * dpr
        p.vx *= 0.99
        p.x += p.vx
        p.y += p.vy
        p.rot += p.vr
        ctx.save()
        ctx.globalAlpha = Math.max(0, 1 - el / duration)
        ctx.translate(p.x, p.y)
        ctx.rotate(p.rot)
        ctx.fillStyle = p.c
        if (p.heart) {
          ctx.font = `${p.r * 2.4}px sans-serif`
          ctx.fillText('♥', -p.r, p.r)
        } else ctx.fillRect(-p.r / 2, -p.r, p.r, p.r * 2)
        ctx.restore()
      }
      if (el < duration) raf = requestAnimationFrame(tick)
      else ctx.clearRect(0, 0, W(), H())
    }
    raf = requestAnimationFrame(tick)
    window.addEventListener('resize', resize)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [fire, duration, density])
  return <canvas ref={ref} className="pointer-events-none fixed inset-0 z-50 h-full w-full" aria-hidden="true" />
}
