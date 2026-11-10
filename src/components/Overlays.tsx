import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { PhoneCall, Sparkles, Trophy, XCircle } from 'lucide-react'
import { LifelineGlyph } from './Lifelines'
import { sound } from '../lib/sound'
import type { PublicState } from '../lib/types'

/** Transición entre preguntas: número grande + barrido de luz. */
export function QuestionTransition({ show, number, total, prize }: { show: boolean; number: number; total: number; prize?: string }) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key={number}
          className="fixed inset-0 z-40 grid place-items-center overflow-hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.5 } }}
          style={{ background: 'radial-gradient(circle at 50% 50%, rgba(36,0,82,0.92), rgba(5,11,53,0.98) 70%)' }}
        >
          <motion.div
            className="absolute inset-y-0 w-[40vw] bg-gradient-to-r from-transparent via-white/25 to-transparent"
            initial={{ x: '-80vw', skewX: -20 }}
            animate={{ x: '120vw' }}
            transition={{ duration: 1.1, ease: 'easeInOut' }}
          />
          <motion.div
            className="absolute h-[70vmin] w-[70vmin] rounded-full border-2 border-gold/40"
            initial={{ scale: 0.2, opacity: 0 }}
            animate={{ scale: 1.4, opacity: [0, 1, 0] }}
            transition={{ duration: 1.6 }}
          />
          <div className="relative text-center">
            <motion.div
              className="text-sm font-extrabold uppercase tracking-[0.45em] text-electric"
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.15 }}
            >
              Pregunta
            </motion.div>
            <motion.div
              className="font-display text-[8rem] font-black leading-none text-gold-grad sm:text-[11rem]"
              initial={{ scale: 2.4, opacity: 0, filter: 'blur(12px)' }}
              animate={{ scale: 1, opacity: 1, filter: 'blur(0px)' }}
              transition={{ type: 'spring', stiffness: 160, damping: 14, delay: 0.2 }}
            >
              {number}
            </motion.div>
            <motion.div
              className="mt-1 text-xs font-bold uppercase tracking-[0.3em] text-white/60"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
            >
              de {total}
            </motion.div>
            {prize && (
              <motion.div
                className="mx-auto mt-5 inline-flex items-center gap-2 rounded-full border border-gold/50 bg-gold/10 px-5 py-2 text-sm font-extrabold uppercase tracking-widest text-gold-light"
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.7 }}
              >
                <Sparkles size={16} /> {prize}
              </motion.div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/** Cuenta atrás sincronizada con el reloj del servidor. */
export function useCountdown(startedAt: string | null, duration: number, serverNow: () => number) {
  const [left, setLeft] = useState(duration)
  useEffect(() => {
    if (!startedAt) {
      setLeft(duration)
      return
    }
    const end = new Date(startedAt).getTime() + duration * 1000
    let last = -1
    const tick = () => {
      const l = Math.max(0, Math.ceil((end - serverNow()) / 1000))
      setLeft(l)
      if (l !== last && l > 0 && l <= 10) sound.play('tick')
      last = l
    }
    tick()
    const id = window.setInterval(tick, 200)
    return () => window.clearInterval(id)
  }, [startedAt, duration, serverNow])
  return left
}

export function CountdownRing({ left, duration, size = 220 }: { left: number; duration: number; size?: number }) {
  const r = 90
  const c = 2 * Math.PI * r
  const pct = duration > 0 ? left / duration : 0
  const color = left <= 5 ? '#E52235' : left <= 10 ? '#FF941E' : '#FFD966'
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg viewBox="0 0 200 200" className="h-full w-full -rotate-90">
        <circle cx="100" cy="100" r={r} fill="rgba(5,11,53,0.8)" stroke="rgba(255,255,255,0.1)" strokeWidth="10" />
        <circle
          cx="100"
          cy="100"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          style={{ transition: 'stroke-dashoffset 0.25s linear, stroke 0.3s', filter: `drop-shadow(0 0 10px ${color})` }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <span className="font-display text-7xl font-black tabular-nums" style={{ color }}>
          {left}
        </span>
      </div>
    </div>
  )
}

/** Pantalla especial de LA LLAMADA (jugador). */
export function CallOverlay({ state, serverNow }: { state: PublicState; serverNow: () => number }) {
  const open = state.activeLifeline === 'call'
  const left = useCountdown(state.call.status === 'running' ? state.call.startedAt : null, state.call.duration, serverNow)
  const ringing = state.call.status === 'ringing'
  useEffect(() => {
    if (!open || !ringing) return
    sound.play('ring')
    const id = window.setInterval(() => sound.play('ring'), 2600)
    return () => window.clearInterval(id)
  }, [open, ringing])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-30 flex flex-col items-center justify-center gap-6 px-6 text-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          style={{ background: 'radial-gradient(circle at 50% 40%, #0b3f86 0%, #061650 45%, #050B35 75%)' }}
        >
          <motion.div initial={{ scale: 0.6, rotate: -20 }} animate={{ scale: 1, rotate: 0 }} className="h-24 w-24">
            <LifelineGlyph kind="call" />
          </motion.div>
          <h2 className="font-display text-4xl font-black text-gold-grad">LA LLAMADA</h2>

          {ringing && (
            <div className="flex flex-col items-center gap-5">
              <div className="relative grid h-36 w-36 place-items-center">
                {[0, 1, 2].map((i) => (
                  <motion.span
                    key={i}
                    className="absolute inset-0 rounded-full border-2 border-gold/60"
                    animate={{ scale: [1, 1.8], opacity: [0.8, 0] }}
                    transition={{ duration: 1.8, repeat: Infinity, delay: i * 0.6 }}
                  />
                ))}
                <motion.div
                  className="grid h-24 w-24 place-items-center rounded-full bg-gradient-to-b from-correct to-green-700 shadow-[0_0_40px_rgba(55,217,0,0.6)]"
                  animate={{ rotate: [0, -12, 12, -12, 12, 0] }}
                  transition={{ duration: 0.8, repeat: Infinity, repeatDelay: 0.6 }}
                >
                  <PhoneCall size={42} />
                </motion.div>
              </div>
              <p className="max-w-xs text-lg font-bold text-white/90">Llamando… Elige a quién quieres pedir ayuda.</p>
              <p className="text-sm text-white/60">El presentador pondrá en marcha los 30 segundos.</p>
            </div>
          )}

          {state.call.status === 'running' && (
            <div className="flex flex-col items-center gap-4">
              <CountdownRing left={left} duration={state.call.duration} />
              <p className="text-lg font-bold">{left > 0 ? '¡Habla ahora!' : '¡Se acabó el tiempo!'}</p>
            </div>
          )}

          {state.call.status === 'ended' && <p className="text-xl font-bold">Llamada finalizada</p>}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/** Pantalla especial de LA PRUEBA (jugador). */
export function ChallengeOverlay({ state }: { state: PublicState }) {
  const open = state.activeLifeline === 'challenge'
  const st = state.challenge.status
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-30 flex flex-col items-center justify-center gap-6 overflow-hidden px-6 text-center"
          initial={{ clipPath: 'circle(0% at 50% 85%)' }}
          animate={{ clipPath: 'circle(150% at 50% 85%)' }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.8, ease: 'easeInOut' }}
          style={{ background: 'radial-gradient(circle at 50% 30%, #5a0fb8 0%, #240052 55%, #050B35 100%)' }}
        >
          <motion.div
            className="h-28 w-28"
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', delay: 0.3 }}
          >
            <LifelineGlyph kind="challenge" />
          </motion.div>
          <h2 className="font-display text-4xl font-black text-gold-grad">LA PRUEBA</h2>

          {st === 'pending' && (
            <motion.p
              className="max-w-xs text-lg font-bold text-white/90"
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              El presentador está preparando tu reto…
            </motion.p>
          )}

          {st === 'shown' && state.challenge.text && (
            <motion.div
              initial={{ y: 30, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className="card max-w-md px-6 py-6"
            >
              <div className="mb-2 text-xs font-extrabold uppercase tracking-[0.3em] text-gold-light">Tu reto</div>
              <p className="text-2xl font-extrabold leading-snug" style={{ textWrap: 'balance' }}>
                {state.challenge.text}
              </p>
            </motion.div>
          )}

          {st === 'passed' && (
            <motion.div initial={{ scale: 0.5 }} animate={{ scale: 1 }} className="flex flex-col items-center gap-3">
              <Trophy size={64} className="text-gold" />
              <p className="font-display text-3xl font-black text-correct">¡PRUEBA SUPERADA!</p>
              <p className="text-white/70">Volvemos a la pregunta…</p>
            </motion.div>
          )}
          {st === 'failed' && (
            <motion.div initial={{ scale: 0.5 }} animate={{ scale: 1 }} className="flex flex-col items-center gap-3">
              <XCircle size={64} className="text-wrong" />
              <p className="font-display text-3xl font-black text-wrong">PRUEBA NO SUPERADA</p>
              <p className="text-white/70">Volvemos a la pregunta…</p>
            </motion.div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
