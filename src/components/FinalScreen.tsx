import { motion } from 'motion/react'
import { Heart } from 'lucide-react'
import { useEffect } from 'react'
import { Logo } from './Logo'
import { Confetti } from './Confetti'
import { sound } from '../lib/sound'
import type { PublicState } from '../lib/types'

function verdict(ok: number, total: number) {
  const pct = total ? ok / total : 0
  if (pct === 1)
    return {
      title: '¡PLENO ABSOLUTO!',
      msg: 'Paula, no has fallado ni una. Queda demostrado: nadie conoce a Adri como tú. ¡Que suenen las campanas!',
    }
  if (pct >= 0.7)
    return {
      title: '¡MATRIMONIO APROBADO!',
      msg: 'Paula, has demostrado que conoces a Adri de verdad. El jurado lo tiene claro: ¡esta boda tiene todas las bendiciones!',
    }
  if (pct >= 0.4)
    return {
      title: '¡VAS POR BUEN CAMINO!',
      msg: 'Paula, aún quedan algunos secretos de Adri por descubrir… ¡pero para eso tenéis toda una vida juntos!',
    }
  return {
    title: '¡EL AMOR LO PUEDE TODO!',
    msg: 'Paula, puede que las preguntas se te hayan resistido, pero lo importante es que el «sí, quiero» ya lo tienes asegurado.',
  }
}

export function FinalScreen({ state, footer }: { state: PublicState; footer?: React.ReactNode }) {
  const ok = state.correctCount
  const total = state.totalQuestions
  const v = verdict(ok, total)
  useEffect(() => {
    sound.play('final')
  }, [])
  return (
    <div className="relative z-10 mx-auto flex min-h-dvh w-full max-w-lg flex-col items-center justify-center gap-6 px-5 py-10 text-center">
      <Confetti fire={1} duration={6000} density={220} />
      <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring' }}>
        <Logo variant="compact" />
      </motion.div>
      <motion.h1
        className="font-display text-3xl font-black leading-tight text-gold-grad text-glow sm:text-4xl"
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.3 }}
      >
        {v.title}
      </motion.h1>
      <motion.div
        className="card w-full px-6 py-6"
        initial={{ y: 30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.5 }}
      >
        <div className="text-xs font-extrabold uppercase tracking-[0.3em] text-white/60">Resultado final</div>
        <div className="my-2 font-display text-7xl font-black text-white">
          {ok}
          <span className="text-3xl text-white/40"> / {total}</span>
        </div>
        <div className="text-sm font-bold uppercase tracking-widest text-gold-light">preguntas acertadas</div>
        <div className="mt-4 flex flex-wrap justify-center gap-1.5">
          {Array.from({ length: total }).map((_, i) => {
            const r = state.results.find((x) => x.index === i)
            return (
              <span
                key={i}
                className={`grid h-7 w-7 place-items-center rounded-full text-[0.7rem] font-black ${
                  !r ? 'bg-white/10 text-white/40' : r.ok ? 'bg-correct text-green-950' : 'bg-wrong text-white'
                }`}
              >
                {i + 1}
              </span>
            )
          })}
        </div>
      </motion.div>
      <motion.p
        className="text-lg font-semibold leading-relaxed text-white/90"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8 }}
        style={{ textWrap: 'pretty' }}
      >
        {v.msg}
      </motion.p>
      <motion.div
        className="flex items-center gap-2 font-display text-xl font-black text-gold-grad"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.1 }}
      >
        <Heart className="fill-[#FF6FA3] text-[#FF6FA3]" size={22} /> PAULA & ADRI <Heart className="fill-[#FF6FA3] text-[#FF6FA3]" size={22} />
      </motion.div>
      <p className="text-sm text-white/60">¡Por un «sí, quiero» lleno de amor, risas y mucha felicidad!</p>
      {footer}
    </div>
  )
}
