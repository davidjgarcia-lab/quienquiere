import { motion } from 'motion/react'
import { LETTERS } from '../lib/types'

export type AnswerVisual = 'idle' | 'selected' | 'locked' | 'correct' | 'wrong' | 'eliminated' | 'dim'

interface Props {
  index: number
  text: string
  visual: AnswerVisual
  disabled?: boolean
  onClick?: () => void
  badge?: React.ReactNode
  compact?: boolean
  dense?: boolean
  delay?: number
}

export function AnswerButton({ index, text, visual, disabled, onClick, badge, compact, dense, delay = 0 }: Props) {
  const long = text.length > 46
  return (
    <motion.div
      className="rail"
      initial={{ opacity: 0, x: index % 2 === 0 ? -40 : 40 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay, type: 'spring', stiffness: 220, damping: 24 }}
    >
      <button
        type="button"
        className="hex answer block"
        data-state={visual === 'idle' ? undefined : visual}
        disabled={disabled}
        onClick={onClick}
        aria-pressed={visual === 'selected' || visual === 'locked'}
        aria-label={`Respuesta ${LETTERS[index]}: ${text}`}
      >
        <span className="hex__frame" />
        <span className="hex__fill" />
        <span
          className={`hex__content flex items-center gap-3 ${compact ? 'px-6 py-2.5 min-h-[58px]' : dense ? 'px-6 py-2 min-h-[50px]' : 'px-7 py-3 sm:py-3.5 min-h-[58px]'}`}
        >
          <span className="diamond shrink-0 scale-75 opacity-90" />
          <span className={`answer__letter shrink-0 ${compact ? 'text-lg' : 'text-xl sm:text-2xl'}`}>
            {LETTERS[index]}:
          </span>
          <span
            className={`answer__text flex-1 font-bold leading-tight text-white break-words ${
              long ? 'text-[0.92rem] sm:text-base' : compact ? 'text-base' : 'text-[1.05rem] sm:text-lg'
            }`}
          >
            {text}
          </span>
          {badge}
        </span>
      </button>
    </motion.div>
  )
}
