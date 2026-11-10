import type { PublicState } from '../lib/types'

export function PrizeLadder({ state, compact }: { state: PublicState; compact?: boolean }) {
  const rows = state.ladder.map((l, i) => ({ ...l, i })).reverse()
  return (
    <ol className="flex flex-col gap-1">
      {rows.map(({ prize, i }) => {
        const current = state.status === 'playing' && i === state.questionIndex
        const r = state.results.find((x) => x.index === i)
        return (
          <li
            key={i}
            className={`flex items-center gap-3 rounded-full px-3 ${compact ? 'py-1 text-xs' : 'py-1.5 text-sm'} font-bold transition ${
              current
                ? 'bg-gradient-to-r from-select to-amber-500 text-[#1b0b00] shadow-[0_0_18px_rgba(255,148,30,0.6)]'
                : r?.ok
                  ? 'text-correct'
                  : r
                    ? 'text-wrong/80'
                    : 'text-white/70'
            }`}
          >
            <span className={`w-6 text-right tabular-nums ${current ? '' : 'text-gold-light'}`}>{i + 1}</span>
            <span className="diamond scale-50" />
            <span className="truncate">{prize || '—'}</span>
          </li>
        )
      })}
    </ol>
  )
}
