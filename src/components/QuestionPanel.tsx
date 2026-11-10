import { motion } from 'motion/react'

export function QuestionPanel({ text, category, compact, dense }: { text: string; category?: string; compact?: boolean; dense?: boolean }) {
  const len = text.length
  const size = compact
    ? 'text-lg sm:text-xl'
    : dense
      ? len > 110
        ? 'text-[0.95rem] sm:text-lg'
        : 'text-lg sm:text-xl'
    : len > 140
      ? 'text-base sm:text-xl'
      : len > 90
        ? 'text-lg sm:text-2xl'
        : 'text-xl sm:text-[1.7rem]'
  return (
    <motion.div
      className="rail"
      initial={{ opacity: 0, scale: 0.92, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 180, damping: 20 }}
    >
      <div className="hex" style={{ ['--edge' as string]: '30px', ['--border' as string]: '2.5px' }}>
        <span className="hex__frame" />
        <span
          className="hex__fill"
          style={{ background: 'linear-gradient(180deg, #0d2a6e 0%, #04154a 40%, #050b35 100%)' }}
        />
        <div className={`hex__content flex flex-col items-center justify-center text-center ${compact ? 'px-10 py-5 min-h-[110px]' : dense ? 'px-8 py-3.5 min-h-[104px]' : 'px-9 sm:px-14 py-6 sm:py-8 min-h-[132px] sm:min-h-[160px]'}`}>
          {category && (
            <span className={`${dense ? 'mb-1' : 'mb-2'} rounded-full border border-gold/40 bg-gold/10 px-3 py-0.5 text-[0.62rem] font-extrabold uppercase tracking-[0.2em] text-gold-light`}>
              {category}
            </span>
          )}
          <p className={`font-bold leading-snug text-white ${size}`} style={{ textWrap: 'balance' }}>
            {text}
          </p>
        </div>
      </div>
    </motion.div>
  )
}
