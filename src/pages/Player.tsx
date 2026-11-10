import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Lock, WifiOff } from 'lucide-react'
import { Stage } from '../components/Stage'
import { Logo } from '../components/Logo'
import { AnswerButton, type AnswerVisual } from '../components/AnswerButton'
import { QuestionPanel } from '../components/QuestionPanel'
import { LIFELINE_LABEL, LifelineButton } from '../components/Lifelines'
import { SoundToggle } from '../components/SoundToggle'
import { Confetti } from '../components/Confetti'
import { CallOverlay, ChallengeOverlay, QuestionTransition } from '../components/Overlays'
import { FinalScreen } from '../components/FinalScreen'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { errorMessage, supabase } from '../lib/supabase'
import { useGameSync } from '../lib/useGameSync'
import { sound } from '../lib/sound'
import { LETTERS, type LifelineKind, type PublicState } from '../lib/types'

const KEY_STORAGE = 'qqc-player-key'
type RevealStage = 'none' | 'suspense' | 'shown'

const LIFELINE_HELP: Record<LifelineKind, string> = {
  fifty: 'Se eliminarán dos respuestas incorrectas al azar.',
  call: 'Podrás llamar a alguien durante 30 segundos para pedir ayuda.',
  challenge: 'Tendrás que superar un reto que te propondrá el presentador.',
}

export default function Player() {
  const [params] = useSearchParams()
  const key = useMemo(() => {
    const k = params.get('k')?.trim()
    if (k) {
      localStorage.setItem(KEY_STORAGE, k)
      return k
    }
    return localStorage.getItem(KEY_STORAGE)
  }, [params])

  const fetchState = useMemo(
    () =>
      key
        ? async () => {
            const { data, error } = await supabase.rpc('player_get_state', { p_key: key })
            if (error) throw error
            return data as PublicState
          }
        : null,
    [key],
  )

  const { state, error, link, accept, serverNow, loading } = useGameSync<PublicState>({
    topicKey: key,
    fetchState,
    role: 'player',
  })

  if (!key) return <Message title="Falta el enlace de la partida" body="Pide al presentador el enlace o el código QR para unirte al concurso." />
  if (!state && error && /no encontrada/i.test(error))
    return <Message title="Partida no encontrada" body="Este enlace ya no es válido. Pide al presentador el enlace actualizado." />
  if (!state) return <Message title={loading ? 'Conectando con el plató…' : 'Sin conexión'} body={error ?? undefined} spinner={loading || !error} />

  return <PlayerGame state={state} playerKey={key} accept={accept} serverNow={serverNow} offline={link === 'offline' || !!error} />
}

function Message({ title, body, spinner }: { title: string; body?: string; spinner?: boolean }) {
  return (
    <>
      <Stage />
      <main className="relative z-10 mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-6 px-6 text-center">
        <Logo variant="compact" />
        <h1 className="text-xl font-black uppercase tracking-wide text-gold-light">{title}</h1>
        {body && <p className="text-white/75">{body}</p>}
        {spinner && <span className="h-10 w-10 animate-spin rounded-full border-4 border-gold/30 border-t-gold" />}
      </main>
    </>
  )
}

interface GameProps {
  state: PublicState
  playerKey: string
  accept: (s: PublicState) => void
  serverNow: () => number
  offline: boolean
}

function PlayerGame({ state, playerKey, accept, serverNow, offline }: GameProps) {
  const [ready, setReady] = useState(false)
  const [pending, setPending] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [confirmLifeline, setConfirmLifeline] = useState<LifelineKind | null>(null)
  const [revealStage, setRevealStage] = useState<RevealStage>(state.answerRevealed ? 'shown' : 'none')
  const [flash, setFlash] = useState<'correct' | 'wrong' | null>(null)
  const [confetti, setConfetti] = useState(0)
  const [transition, setTransition] = useState(false)
  const compactHeight = useShortScreen()

  const prevRevealed = useRef(state.answerRevealed)
  const prevSeq = useRef(state.transitionSeq)
  const prevLifelines = useRef(state.lifelines)
  const prevChallenge = useRef(state.challenge.status)
  const timers = useRef<number[]>([])

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), [])
  const later = (fn: () => void, ms: number) => timers.current.push(window.setTimeout(fn, ms))

  const showToast = useCallback((m: string) => {
    setToast(m)
    window.setTimeout(() => setToast((t) => (t === m ? null : t)), 3200)
  }, [])

  // --- Revelación con pausa dramática --------------------------------------
  const revealTimers = useRef<number[]>([])
  const clearReveal = () => {
    revealTimers.current.forEach((t) => window.clearTimeout(t))
    revealTimers.current = []
  }
  useEffect(() => clearReveal, [])
  useEffect(() => {
    const was = prevRevealed.current
    prevRevealed.current = state.answerRevealed
    if (!state.answerRevealed) {
      // Pregunta nueva / reiniciada: cancelar cualquier revelación pendiente.
      clearReveal()
      setRevealStage('none')
      setFlash(null)
      return
    }
    if (was) return
    const ok = state.correctAnswer === state.selectedAnswer
    setRevealStage('suspense')
    sound.play('reveal')
    clearReveal()
    revealTimers.current.push(
      window.setTimeout(
        () => {
          setRevealStage('shown')
          setFlash(ok ? 'correct' : 'wrong')
          sound.play(ok ? 'correct' : 'wrong')
          if (ok) setConfetti((c) => c + 1)
          if (navigator.vibrate) navigator.vibrate(ok ? [60, 40, 60] : [300])
          revealTimers.current.push(window.setTimeout(() => setFlash(null), 2600))
        },
        ok ? 1100 : 2400,
      ),
    )
  }, [state.answerRevealed, state.correctAnswer, state.selectedAnswer, state.questionIndex])

  // --- Transición entre preguntas -------------------------------------------
  useEffect(() => {
    if (state.transitionSeq !== prevSeq.current) {
      prevSeq.current = state.transitionSeq
      setPending(null)
      if (state.status === 'playing') {
        setTransition(true)
        sound.play('transition')
        later(() => setTransition(false), 2300)
      }
    }
  }, [state.transitionSeq, state.status])

  // --- Sonido al gastar comodines -------------------------------------------
  useEffect(() => {
    const p = prevLifelines.current
    const n = state.lifelines
    if ((!p.fifty && n.fifty) || (!p.call && n.call) || (!p.challenge && n.challenge)) sound.play('lifeline')
    prevLifelines.current = n
    if (state.challenge.status !== prevChallenge.current) {
      if (state.challenge.status === 'passed') {
        setConfetti((c) => c + 1)
        sound.play('correct')
      } else if (state.challenge.status === 'failed') sound.play('wrong')
      prevChallenge.current = state.challenge.status
    }
  }, [state.lifelines, state.challenge.status])

  // Si la selección del servidor coincide, se limpia la optimista
  useEffect(() => {
    if (pending !== null && state.selectedAnswer === pending) setPending(null)
    if (state.answerLocked || state.answerRevealed) setPending(null)
  }, [state.selectedAnswer, state.answerLocked, state.answerRevealed, pending])

  const selected = pending ?? state.selectedAnswer
  const q = state.question
  const blocked = state.answerLocked || state.answerRevealed || !!state.activeLifeline || revealStage !== 'none'

  const select = async (i: number) => {
    if (blocked || state.eliminatedAnswers.includes(i) || i === selected) return
    sound.play('select')
    if (navigator.vibrate) navigator.vibrate(15)
    setPending(i)
    try {
      const { data, error } = await supabase.rpc('player_select_answer', { p_key: playerKey, p_answer: i })
      if (error) throw error
      accept(data as PublicState)
    } catch (e) {
      setPending(null)
      showToast(errorMessage(e))
    }
  }

  const triggerLifeline = async (kind: LifelineKind) => {
    setConfirmLifeline(null)
    setBusy(true)
    try {
      const { data, error } = await supabase.rpc('player_use_lifeline', { p_key: playerKey, p_kind: kind })
      if (error) throw error
      accept(data as PublicState)
    } catch (e) {
      showToast(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const visualFor = (i: number): AnswerVisual => {
    const elim = state.eliminatedAnswers.includes(i)
    const sel = selected === i
    if (revealStage === 'shown' && state.correctAnswer !== null) {
      if (i === state.correctAnswer) return 'correct'
      if (sel) return 'wrong'
      return elim ? 'eliminated' : 'dim'
    }
    if (elim) return 'eliminated'
    if (sel) return state.answerLocked || revealStage === 'suspense' ? 'locked' : 'selected'
    return 'idle'
  }

  const hue = ((state.questionIndex % 5) - 2) * 9

  // ------------------------------------------------------------------ Lobby
  if (state.status === 'lobby') {
    return (
      <>
        <Stage />
        <main className="safe-top safe-bottom relative z-10 mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-7 px-6 text-center">
          <div className="absolute right-4 top-4">
            <SoundToggle />
          </div>
          <motion.div
            initial={{ opacity: 0, scale: 0.7, filter: 'blur(14px)' }}
            animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
            transition={{ duration: 1.2, ease: 'easeOut' }}
          >
            <Logo variant="hero" />
          </motion.div>
          <motion.p
            className="max-w-sm text-base font-semibold leading-relaxed text-white/85"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8 }}
            style={{ textWrap: 'balance' }}
          >
            El concurso donde solo una persona puede demostrar que conoce a Adri de verdad.
          </motion.p>
          <AnimatePresence mode="wait">
            {!ready ? (
              <motion.button
                key="start"
                type="button"
                className="btn-gold text-base"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ delay: 1.1 }}
                onClick={() => {
                  sound.unlock()
                  sound.play('intro')
                  setReady(true)
                }}
              >
                Comenzar el concurso
              </motion.button>
            ) : (
              <motion.div key="wait" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center gap-3">
                <span className="h-9 w-9 animate-spin rounded-full border-4 border-gold/30 border-t-gold" />
                <p className="text-sm font-bold uppercase tracking-[0.2em] text-gold-light">
                  ¡Lista, Paula! Esperando al presentador…
                </p>
              </motion.div>
            )}
          </AnimatePresence>
          {offline && <OfflineBadge />}
        </main>
      </>
    )
  }

  // ------------------------------------------------------------------ Final
  if (state.status === 'finished') {
    return (
      <>
        <Stage hue={-20} />
        <FinalScreen state={state} />
      </>
    )
  }

  // ------------------------------------------------------------------ Juego
  const status = (() => {
    if (revealStage === 'suspense') return { text: 'Y la respuesta correcta es…', tone: 'gold' as const }
    if (revealStage === 'shown') {
      if (state.correctAnswer === selected) return { text: '¡RESPUESTA CORRECTA!', tone: 'green' as const }
      return {
        text: `¡Oh, no! La correcta era la ${state.correctAnswer !== null ? LETTERS[state.correctAnswer] : ''}`,
        tone: 'red' as const,
      }
    }
    if (state.answerLocked && selected !== null)
      return { text: `Respuesta ${LETTERS[selected]} bloqueada · esperando al presentador…`, tone: 'orange' as const }
    if (selected !== null)
      return { text: `Has elegido la ${LETTERS[selected]} · puedes cambiarla hasta que se bloquee`, tone: 'orange' as const }
    return { text: 'Elige tu respuesta', tone: 'white' as const }
  })()

  const toneClass = {
    gold: 'text-gold-light',
    green: 'text-correct',
    red: 'text-wrong',
    orange: 'text-select',
    white: 'text-white/80',
  }[status.tone]

  return (
    <>
      <Stage hue={hue} flash={flash} />
      <Confetti fire={confetti} />
      <QuestionTransition
        show={transition}
        number={state.questionIndex + 1}
        total={state.totalQuestions}
        prize={q?.prize}
      />
      <CallOverlay state={state} serverNow={serverNow} />
      <ChallengeOverlay state={state} />

      <main className="safe-top safe-bottom relative z-10 mx-auto flex min-h-dvh w-full max-w-3xl flex-col overflow-x-hidden px-4 sm:px-6">
        {/* Cabecera */}
        <header className="flex items-center justify-between gap-3 pt-1">
          <Logo variant="inline" />
          <SoundToggle />
        </header>

        <div className="mt-4 [@media(max-height:780px)]:mt-2">
          <div className="flex items-end justify-between text-xs font-extrabold uppercase tracking-[0.18em]">
            <span className="text-white/70">
              Pregunta <span className="text-lg text-gold-light">{state.questionIndex + 1}</span>
              <span className="text-white/50"> / {state.totalQuestions}</span>
            </span>
            {q?.prize && <span className="max-w-[55%] truncate text-gold-light">{q.prize}</span>}
          </div>
          <div className="mt-2 flex gap-1" aria-hidden="true">
            {Array.from({ length: state.totalQuestions }).map((_, i) => {
              const r = state.results.find((x) => x.index === i)
              return (
                <span
                  key={i}
                  className={`h-1.5 flex-1 rounded-full transition-colors duration-500 ${
                    i === state.questionIndex
                      ? 'bg-select shadow-[0_0_8px_rgba(255,148,30,0.9)]'
                      : r
                        ? r.ok
                          ? 'bg-correct'
                          : 'bg-wrong'
                        : 'bg-white/15'
                  }`}
                />
              )
            })}
          </div>
        </div>

        {/* Pregunta y respuestas */}
        <section className="flex flex-1 flex-col justify-center gap-5 py-5 [@media(max-height:780px)]:gap-3 [@media(max-height:780px)]:py-3">
          {q ? (
            <>
              <QuestionPanel key={`q-${q.id}`} text={q.text} category={q.category} dense={compactHeight} />
              <div className="isolate grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-x-6 [@media(max-height:780px)]:gap-2">
                {q.answers.map((a, i) => (
                  <AnswerButton
                    key={`${q.id}-${i}`}
                    index={i}
                    text={a}
                    visual={visualFor(i)}
                    delay={0.15 + i * 0.08}
                    dense={compactHeight}
                    disabled={blocked || state.eliminatedAnswers.includes(i)}
                    onClick={() => select(i)}
                    badge={
                      visualFor(i) === 'locked' ? <Lock size={16} className="shrink-0 text-[#1b0b00]" /> : undefined
                    }
                  />
                ))}
              </div>
            </>
          ) : (
            <p className="text-center text-white/70">Esperando la siguiente pregunta…</p>
          )}
        </section>

        {/* Mensaje de estado */}
        <div className="min-h-[2.25rem] text-center [@media(max-height:780px)]:min-h-[1.75rem]" aria-live="polite">
          <AnimatePresence mode="wait">
            <motion.p
              key={status.text}
              className={`text-sm font-extrabold uppercase tracking-[0.12em] ${toneClass} ${
                revealStage === 'shown' ? 'text-lg' : ''
              }`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
            >
              {status.text}
            </motion.p>
          </AnimatePresence>
        </div>

        {/* Comodines */}
        <footer className="pb-2">
          <div className="mx-auto flex max-w-sm items-start justify-around rounded-[28px] border border-white/10 bg-night/50 px-3 pb-2 pt-2.5 backdrop-blur-sm">
            {(['fifty', 'call', 'challenge'] as const).map((k) => (
              <LifelineButton
                key={k}
                kind={k}
                used={state.lifelines[k]}
                active={state.activeLifeline === k}
                disabled={blocked || busy}
                onClick={() => setConfirmLifeline(k)}
                size={compactHeight ? 54 : 68}
              />
            ))}
          </div>
          <p className="mt-1.5 text-center text-[0.64rem] font-bold uppercase tracking-[0.18em] text-white/45">
            {['fifty', 'call', 'challenge'].filter((k) => !state.lifelines[k as LifelineKind]).length} de 3 comodines
            disponibles
          </p>
        </footer>
      </main>

      {offline && (
        <div className="fixed left-1/2 top-3 z-50 -translate-x-1/2">
          <OfflineBadge />
        </div>
      )}

      <AnimatePresence>
        {toast && (
          <motion.div
            className="fixed bottom-24 left-1/2 z-50 w-[90%] max-w-sm -translate-x-1/2 rounded-2xl border border-wrong/50 bg-[#2a0710]/95 px-4 py-3 text-center text-sm font-bold"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            role="status"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>

      <ConfirmDialog
        open={confirmLifeline !== null}
        title={confirmLifeline ? `¿Usar el comodín ${LIFELINE_LABEL[confirmLifeline]}?` : ''}
        body={confirmLifeline ? `${LIFELINE_HELP[confirmLifeline]} Solo puedes usarlo una vez en todo el concurso.` : null}
        confirmLabel="Usar comodín"
        onCancel={() => setConfirmLifeline(null)}
        onConfirm={() => confirmLifeline && triggerLifeline(confirmLifeline)}
      />
    </>
  )
}

function useShortScreen() {
  const query = '(max-height: 780px)'
  const [short, setShort] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const on = () => setShort(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return short
}

function OfflineBadge() {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-select/50 bg-[#2a1400]/90 px-3 py-1.5 text-xs font-bold text-select">
      <WifiOff size={14} /> Reconectando…
    </span>
  )
}
