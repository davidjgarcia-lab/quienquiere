import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import {
  CheckCircle2,
  ChevronRight,
  Copy,
  ExternalLink,
  Eye,
  Flag,
  Gamepad2,
  ListChecks,
  Lock,
  LogOut,
  PhoneOff,
  Play,
  QrCode,
  RefreshCw,
  RotateCcw,
  Timer,
  Undo2,
  Unlock,
  Wifi,
  WifiOff,
  XCircle,
} from 'lucide-react'
import { Stage } from '../components/Stage'
import { Logo } from '../components/Logo'
import { AnswerButton, type AnswerVisual } from '../components/AnswerButton'
import { QuestionPanel } from '../components/QuestionPanel'
import { LIFELINE_LABEL, LifelineGlyph } from '../components/Lifelines'
import { SoundToggle } from '../components/SoundToggle'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { PrizeLadder } from '../components/PrizeLadder'
import { CountdownRing, useCountdown } from '../components/Overlays'
import { errorMessage, supabase } from '../lib/supabase'
import { useGameSync } from '../lib/useGameSync'
import { sound } from '../lib/sound'
import { LETTERS, type HostState, type LifelineKind } from '../lib/types'
import QuestionsManager from './QuestionsManager'

type Tab = 'game' | 'questions' | 'link'

interface Confirm {
  title: string
  body?: string
  label: string
  tone?: 'danger' | 'gold'
  run: () => Promise<void> | void
}

const CHALLENGE_PRESETS = [
  'Canta el estribillo de una canción de amor delante de todas.',
  'Baila 20 segundos tu mejor «primer baile» de boda con una invitada.',
  'Di 5 cosas que te encantan de Adri en 20 segundos.',
  'Imita cómo crees que Adri reaccionará en el altar.',
  'Haz un brindis de tres frases por el futuro matrimonio.',
  'Representa con mímica una cita romántica perfecta.',
]

export default function HostDashboard({ gameId, email }: { gameId: string; email: string }) {
  const [tab, setTab] = useState<Tab>('game')
  const [topicKey, setTopicKey] = useState<string | null>(null)

  const fetchState = useCallback(async () => {
    const { data, error } = await supabase.rpc('host_get_state', { p_game_id: gameId })
    if (error) throw error
    return data as HostState
  }, [gameId])

  const { state, error, link, peers, refresh, serverNow } = useGameSync<HostState>({
    topicKey,
    fetchState,
    role: 'host',
  })

  useEffect(() => {
    if (state?.playerKey && state.playerKey !== topicKey) setTopicKey(state.playerKey)
  }, [state?.playerKey, topicKey])

  const [busy, setBusy] = useState<string | null>(null)
  const [toast, setToast] = useState<{ tone: 'error' | 'ok'; text: string } | null>(null)
  const [confirm, setConfirm] = useState<Confirm | null>(null)

  const notify = useCallback((tone: 'error' | 'ok', text: string) => {
    setToast({ tone, text })
    window.setTimeout(() => setToast((t) => (t?.text === text ? null : t)), 3500)
  }, [])

  const rpc = useCallback(
    async (name: string, args: Record<string, unknown> = {}, label = name) => {
      setBusy(label)
      try {
        const { error } = await supabase.rpc(name, { p_game_id: gameId, ...args })
        if (error) throw error
        await refresh()
        return true
      } catch (e) {
        notify('error', errorMessage(e))
        return false
      } finally {
        setBusy(null)
      }
    },
    [gameId, refresh, notify],
  )

  // Avisos al presentador cuando Paula actúa
  const prev = useRef<HostState | null>(null)
  useEffect(() => {
    if (!state) return
    const p = prev.current
    prev.current = state
    if (!p) return
    if (p.selectedAnswer !== state.selectedAnswer && state.selectedAnswer !== null && !state.answerRevealed) {
      sound.play('select')
      notify('ok', `Paula ha elegido la ${LETTERS[state.selectedAnswer]}`)
    }
    ;(['fifty', 'call', 'challenge'] as const).forEach((k) => {
      if (!p.lifelines[k] && state.lifelines[k]) {
        sound.play('lifeline')
        notify('ok', `Paula ha usado el comodín ${LIFELINE_LABEL[k]}`)
      }
    })
    if (!p.answerRevealed && state.answerRevealed) {
      sound.play(state.correctAnswer === state.selectedAnswer ? 'correct' : 'wrong')
    }
  }, [state, notify])

  const playerUrl = useMemo(
    () => (state ? `${window.location.origin}/jugador?k=${state.playerKey}` : ''),
    [state],
  )

  if (!state)
    return (
      <>
        <Stage />
        <main className="relative z-10 grid min-h-dvh place-items-center">
          <div className="flex flex-col items-center gap-4">
            <span className="h-9 w-9 animate-spin rounded-full border-4 border-gold/30 border-t-gold" />
            <p className="text-white/80">{error ?? 'Conectando con la partida…'}</p>
          </div>
        </main>
      </>
    )

  const q = state.hostQuestion
  const statusLabel = { lobby: 'Pantalla de inicio', playing: 'En juego', finished: 'Finalizado' }[state.status]
  const isLast = state.questionIndex + 1 >= state.totalQuestions

  const visualFor = (i: number): AnswerVisual => {
    const elim = state.eliminatedAnswers.includes(i)
    const sel = state.selectedAnswer === i
    if (state.answerRevealed) {
      if (i === state.correctAnswer) return 'correct'
      if (sel) return 'wrong'
      return elim ? 'eliminated' : 'dim'
    }
    if (sel) return state.answerLocked ? 'locked' : 'selected'
    if (elim) return 'eliminated'
    return 'idle'
  }

  return (
    <>
      <Stage hue={((state.questionIndex % 5) - 2) * 9} />
      <div className="relative z-10 mx-auto flex min-h-dvh w-full max-w-[1400px] flex-col gap-4 px-3 py-3 sm:px-5">
        {/* ------------------------------------------------ Cabecera */}
        <header className="card flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3">
          <Logo variant="inline" />
          <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
            <Pill tone={link === 'live' ? 'green' : 'orange'} icon={link === 'live' ? <Wifi size={13} /> : <WifiOff size={13} />}>
              {link === 'live' ? 'Tiempo real activo' : 'Reconectando…'}
            </Pill>
            <Pill tone={peers.player ? 'green' : 'red'} dot>
              Paula {peers.player ? 'conectada' : 'desconectada'}
            </Pill>
            <Pill tone="gold">{statusLabel}</Pill>
            {state.status === 'playing' && (
              <Pill tone="blue">
                Pregunta {state.questionIndex + 1} / {state.totalQuestions}
              </Pill>
            )}
          </div>
          <nav className="ml-auto flex items-center gap-1 rounded-full border border-white/10 bg-night/60 p-1" aria-label="Secciones">
            <TabButton active={tab === 'game'} onClick={() => setTab('game')} icon={<Gamepad2 size={16} />}>
              Concurso
            </TabButton>
            <TabButton active={tab === 'questions'} onClick={() => setTab('questions')} icon={<ListChecks size={16} />}>
              Preguntas
            </TabButton>
            <TabButton active={tab === 'link'} onClick={() => setTab('link')} icon={<QrCode size={16} />}>
              Enlace
            </TabButton>
          </nav>
          <div className="flex items-center gap-2">
            <SoundToggle showMusic={false} />
            <button
              type="button"
              className="grid h-10 w-10 place-items-center rounded-full border border-white/20 bg-white/5 text-white/70 hover:bg-white/10"
              onClick={() =>
                setConfirm({
                  title: '¿Cerrar sesión?',
                  body: `Sesión iniciada como ${email}. La partida se conserva y podrás recuperarla al volver a entrar.`,
                  label: 'Cerrar sesión',
                  run: async () => {
                    await supabase.auth.signOut()
                  },
                })
              }
              aria-label="Cerrar sesión"
              title="Cerrar sesión"
            >
              <LogOut size={17} />
            </button>
          </div>
        </header>

        {tab === 'questions' && <QuestionsManager gameId={gameId} state={state} notify={notify} />}
        {tab === 'link' && (
          <LinkPanel
            url={playerUrl}
            notify={notify}
            onRotate={() =>
              setConfirm({
                title: '¿Generar un enlace nuevo?',
                body: 'El enlace y el QR actuales dejarán de funcionar. Tendrás que enviar el nuevo enlace a Paula.',
                label: 'Generar enlace',
                tone: 'danger',
                run: async () => {
                  const { error } = await supabase.rpc('host_rotate_player_key', { p_game_id: gameId })
                  if (error) notify('error', errorMessage(error))
                  else await refresh()
                },
              })
            }
          />
        )}

        {tab === 'game' && (
          <div className="grid flex-1 grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">
            {/* ------------------------------------------------ Panel principal */}
            <section className="flex flex-col gap-4">
              <div className="card relative overflow-hidden px-4 py-5 sm:px-8">
                {state.status === 'lobby' && (
                  <div className="flex flex-col items-center gap-5 py-6 text-center">
                    <Logo variant="compact" />
                    <p className="max-w-md text-white/80">
                      Paula está viendo la pantalla de inicio. Cuando estéis listos, pulsa para lanzar la primera pregunta.
                    </p>
                    <button
                      type="button"
                      className="btn-gold text-lg"
                      disabled={!!busy || state.totalQuestions === 0}
                      onClick={() => {
                        sound.play('intro')
                        void rpc('host_start_game', {}, 'start')
                      }}
                    >
                      <Play size={20} /> Comenzar el concurso
                    </button>
                    {state.totalQuestions === 0 && <p className="text-sm text-wrong">Añade preguntas antes de empezar.</p>}
                    {!peers.player && (
                      <p className="text-sm text-select">Paula aún no ha abierto su enlace (pestaña «Enlace»).</p>
                    )}
                  </div>
                )}

                {state.status === 'finished' && (
                  <div className="flex flex-col items-center gap-3 py-6 text-center">
                    <Flag className="text-gold" size={40} />
                    <h2 className="font-display text-3xl font-black text-gold-grad">¡Concurso terminado!</h2>
                    <p className="text-lg">
                      Paula ha acertado <b className="text-correct">{state.correctCount}</b> de {state.totalQuestions} preguntas.
                    </p>
                    <p className="text-sm text-white/60">Paula está viendo la pantalla final de celebración.</p>
                  </div>
                )}

                {state.status === 'playing' && q && (
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-wider">
                      <span className="text-white/60">Pregunta {state.questionIndex + 1}</span>
                      <span className="rounded-full bg-white/10 px-2 py-0.5">{q.category}</span>
                      <span className="rounded-full bg-white/10 px-2 py-0.5">Dificultad {q.difficulty}/5</span>
                      {q.prize && <span className="rounded-full bg-gold/15 px-2 py-0.5 text-gold-light">{q.prize}</span>}
                      {q.isSample && <span className="rounded-full bg-violet/40 px-2 py-0.5 text-white">Contenido de prueba</span>}
                    </div>
                    <QuestionPanel key={q.id} text={q.text} compact />
                    <div className="isolate grid grid-cols-1 gap-3 xl:grid-cols-2 [&_button]:cursor-default">
                      {q.answers.map((a, i) => (
                        <AnswerButton
                          key={`${q.id}-${i}`}
                          index={i}
                          text={a}
                          compact
                          visual={visualFor(i)}
                          disabled
                          delay={i * 0.05}
                          badge={
                            <span className="flex shrink-0 flex-col items-end gap-1">
                              {i === state.hostCorrectAnswer && (
                                <span className="rounded-full bg-correct px-2 py-0.5 text-[0.6rem] font-black uppercase tracking-wider text-green-950 shadow">
                                  ✓ Correcta
                                </span>
                              )}
                              {i === state.selectedAnswer && (
                                <span className="rounded-full bg-white px-2 py-0.5 text-[0.6rem] font-black uppercase tracking-wider text-[#1b0b00] shadow">
                                  Paula
                                </span>
                              )}
                            </span>
                          }
                        />
                      ))}
                    </div>
                    <ResultBanner state={state} />
                  </div>
                )}
              </div>

              {/* ------------------------------------------------ Controles */}
              {state.status === 'playing' && (
                <div className="card grid grid-cols-2 gap-3 p-4 md:grid-cols-5">
                  <button
                    type="button"
                    className={`ctrl ${state.answerLocked ? 'ctrl--ghost' : 'ctrl--orange'}`}
                    disabled={!!busy || state.answerRevealed || state.selectedAnswer === null}
                    onClick={() => {
                      if (!state.answerLocked) sound.play('lock')
                      void rpc('host_set_lock', { p_locked: !state.answerLocked }, 'lock')
                    }}
                  >
                    {state.answerLocked ? <Unlock size={17} /> : <Lock size={17} />}
                    {state.answerLocked ? 'Desbloquear' : 'Bloquear respuesta'}
                  </button>
                  <button
                    type="button"
                    className="ctrl ctrl--gold col-span-2 text-base md:col-span-1"
                    disabled={!!busy || state.answerRevealed || state.selectedAnswer === null || !!state.activeLifeline}
                    title={
                      state.selectedAnswer === null
                        ? 'Paula todavía no ha elegido respuesta'
                        : state.activeLifeline
                          ? 'Termina primero el comodín en curso'
                          : undefined
                    }
                    onClick={() => void rpc('host_reveal', {}, 'reveal')}
                  >
                    <Eye size={18} /> Mostrar respuesta
                  </button>
                  <button
                    type="button"
                    className="ctrl ctrl--green"
                    disabled={!!busy || !state.answerRevealed}
                    onClick={() => void rpc('host_next_question', {}, 'next')}
                  >
                    {isLast ? <Flag size={17} /> : <ChevronRight size={18} />}
                    {isLast ? 'Ver resultado final' : 'Siguiente pregunta'}
                  </button>
                  <button
                    type="button"
                    className="ctrl"
                    disabled={!!busy}
                    onClick={() =>
                      setConfirm({
                        title: '¿Reiniciar esta pregunta?',
                        body: 'Se borrará la respuesta de Paula y el resultado de esta pregunta. Los comodines gastados seguirán gastados.',
                        label: 'Reiniciar pregunta',
                        run: () => void rpc('host_reset_question', {}, 'resetq'),
                      })
                    }
                  >
                    <RotateCcw size={17} /> Reiniciar pregunta
                  </button>
                  <button
                    type="button"
                    className="ctrl ctrl--red"
                    disabled={!!busy}
                    onClick={() =>
                      setConfirm({
                        title: '¿Reiniciar toda la partida?',
                        body: 'Se perderá el progreso: volveréis a la pantalla de inicio y se recuperarán los tres comodines.',
                        label: 'Reiniciar partida',
                        tone: 'danger',
                        run: () => void rpc('host_reset_game', {}, 'reset'),
                      })
                    }
                  >
                    <RefreshCw size={17} /> Reiniciar partida
                  </button>
                </div>
              )}

              {state.status !== 'playing' && (
                <div className="card flex flex-wrap justify-center gap-3 p-4">
                  {state.status === 'finished' && (
                    <button type="button" className="ctrl" onClick={() => void rpc('host_reset_question', {}, 'resetq')}>
                      <Undo2 size={17} /> Volver a la última pregunta
                    </button>
                  )}
                  <button
                    type="button"
                    className="ctrl ctrl--red"
                    disabled={!!busy || (state.status === 'lobby' && state.version === 0)}
                    onClick={() =>
                      setConfirm({
                        title: '¿Reiniciar toda la partida?',
                        body: 'Volveréis a la pantalla de inicio y se recuperarán los tres comodines.',
                        label: 'Reiniciar partida',
                        tone: 'danger',
                        run: () => void rpc('host_reset_game', {}, 'reset'),
                      })
                    }
                  >
                    <RefreshCw size={17} /> Reiniciar partida
                  </button>
                </div>
              )}
            </section>

            {/* ------------------------------------------------ Lateral */}
            <aside className="flex flex-col gap-4">
              <div className="card p-4">
                <h2 className="mb-3 text-xs font-black uppercase tracking-[0.2em] text-gold-light">Comodines</h2>
                <div className="flex flex-col gap-3">
                  {(['fifty', 'call', 'challenge'] as const).map((k) => (
                    <LifelineCard
                      key={k}
                      kind={k}
                      state={state}
                      busy={!!busy}
                      rpc={rpc}
                      serverNow={serverNow}
                      onRestore={() =>
                        setConfirm({
                          title: `¿Restaurar ${LIFELINE_LABEL[k]}?`,
                          body: 'Úsalo solo si Paula lo pulsó por error. El comodín volverá a estar disponible.',
                          label: 'Restaurar',
                          run: () => void rpc('host_lifeline', { p_action: `restore_${k}` }, 'restore'),
                        })
                      }
                    />
                  ))}
                </div>
              </div>
              <div className="card p-4">
                <h2 className="mb-3 text-xs font-black uppercase tracking-[0.2em] text-gold-light">
                  Escalera de premios · {state.correctCount} aciertos
                </h2>
                <PrizeLadder state={state} compact />
              </div>
            </aside>
          </div>
        )}
      </div>

      <AnimatePresence>
        {toast && (
          <motion.div
            className={`fixed bottom-5 left-1/2 z-[70] w-[92%] max-w-md -translate-x-1/2 rounded-2xl border px-4 py-3 text-center text-sm font-bold shadow-2xl ${
              toast.tone === 'error' ? 'border-wrong/60 bg-[#2a0710]/95' : 'border-select/60 bg-[#2a1400]/95 text-select'
            }`}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            role="status"
          >
            {toast.text}
          </motion.div>
        )}
      </AnimatePresence>

      <ConfirmDialog
        open={!!confirm}
        title={confirm?.title ?? ''}
        body={confirm?.body}
        confirmLabel={confirm?.label ?? ''}
        tone={confirm?.tone}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          const c = confirm
          setConfirm(null)
          void c?.run()
        }}
      />
    </>
  )
}

function ResultBanner({ state }: { state: HostState }) {
  let text: string
  let cls: string
  if (state.answerRevealed) {
    const ok = state.correctAnswer === state.selectedAnswer
    text = ok
      ? `¡Correcto! Paula ha acertado con la ${LETTERS[state.selectedAnswer ?? 0]}.`
      : `Incorrecto: Paula eligió la ${LETTERS[state.selectedAnswer ?? 0]}; la correcta era la ${LETTERS[state.correctAnswer ?? 0]}.`
    cls = ok ? 'border-correct/60 bg-correct/15 text-green-200' : 'border-wrong/60 bg-wrong/15 text-red-200'
  } else if (state.activeLifeline) {
    text = `Comodín en curso: ${LIFELINE_LABEL[state.activeLifeline]}. Gestiónalo en el panel lateral.`
    cls = 'border-violet/60 bg-violet/20 text-white'
  } else if (state.selectedAnswer === null) {
    text = 'Esperando a que Paula elija una respuesta…'
    cls = 'border-white/15 bg-white/5 text-white/75'
  } else if (state.answerLocked) {
    text = `Respuesta ${LETTERS[state.selectedAnswer]} bloqueada. Cuando quieras, pulsa «Mostrar respuesta».`
    cls = 'border-select/60 bg-select/15 text-orange-100'
  } else {
    text = `Paula ha seleccionado la ${LETTERS[state.selectedAnswer]} (todavía puede cambiarla).`
    cls = 'border-select/60 bg-select/10 text-orange-100'
  }
  return (
    <div className={`rounded-xl border px-4 py-3 text-center text-sm font-bold ${cls}`} aria-live="polite">
      {text}
    </div>
  )
}

function Pill({
  children,
  tone,
  icon,
  dot,
}: {
  children: React.ReactNode
  tone: 'green' | 'red' | 'orange' | 'gold' | 'blue'
  icon?: React.ReactNode
  dot?: boolean
}) {
  const cls = {
    green: 'border-correct/50 text-green-200 bg-correct/10',
    red: 'border-wrong/50 text-red-200 bg-wrong/10',
    orange: 'border-select/50 text-orange-200 bg-select/10',
    gold: 'border-gold/50 text-gold-light bg-gold/10',
    blue: 'border-electric/60 text-sky-200 bg-electric/15',
  }[tone]
  const dotColor = { green: 'bg-correct', red: 'bg-wrong', orange: 'bg-select', gold: 'bg-gold', blue: 'bg-electric' }[tone]
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 ${cls}`}>
      {dot && <span className={`h-2 w-2 rounded-full ${dotColor} ${tone === 'green' ? 'animate-pulse' : ''}`} />}
      {icon}
      {children}
    </span>
  )
}

function TabButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-extrabold uppercase tracking-wider transition ${
        active ? 'bg-gold text-[#2a1600]' : 'text-white/70 hover:bg-white/10'
      }`}
    >
      {icon}
      <span className="hidden sm:inline">{children}</span>
    </button>
  )
}

function LifelineCard({
  kind,
  state,
  busy,
  rpc,
  serverNow,
  onRestore,
}: {
  kind: LifelineKind
  state: HostState
  busy: boolean
  rpc: (name: string, args?: Record<string, unknown>, label?: string) => Promise<boolean>
  serverNow: () => number
  onRestore: () => void
}) {
  const used = state.lifelines[kind]
  const active = state.activeLifeline === kind
  const status = active ? 'En curso' : used ? 'Utilizado' : 'Disponible'
  const statusCls = active
    ? 'bg-select text-[#1b0b00]'
    : used
      ? 'bg-white/10 text-white/50'
      : 'bg-correct/20 text-green-200'

  return (
    <div
      className={`rounded-2xl border p-3 transition ${
        active ? 'border-select/70 bg-select/10 shadow-[0_0_24px_rgba(255,148,30,0.25)]' : 'border-white/10 bg-night/40'
      }`}
    >
      <div className="flex items-center gap-3">
        <div className={`h-12 w-12 shrink-0 ${used && !active ? 'opacity-40 grayscale' : ''}`}>
          <LifelineGlyph kind={kind} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-black uppercase tracking-wider">{LIFELINE_LABEL[kind]}</div>
          {kind === 'fifty' && used && state.eliminatedAnswers.length > 0 && (
            <div className="text-xs text-white/60">
              Eliminadas: {state.eliminatedAnswers.map((i) => LETTERS[i]).join(' y ')}
            </div>
          )}
          {kind === 'challenge' && used && !active && state.challenge.status && (
            <div className="text-xs text-white/60">
              {state.challenge.status === 'passed' ? 'Prueba superada' : state.challenge.status === 'failed' ? 'No superada' : ''}
            </div>
          )}
        </div>
        <span className={`rounded-full px-2.5 py-1 text-[0.65rem] font-black uppercase tracking-wider ${statusCls}`}>{status}</span>
      </div>

      {active && kind === 'call' && <CallControls state={state} busy={busy} rpc={rpc} serverNow={serverNow} />}
      {active && kind === 'challenge' && <ChallengeControls state={state} busy={busy} rpc={rpc} />}

      {used && !active && (
        <button type="button" className="mt-2 text-[0.7rem] font-semibold text-white/45 underline-offset-2 hover:text-white hover:underline" onClick={onRestore}>
          Restaurar (pulsado por error)
        </button>
      )}
    </div>
  )
}

function CallControls({
  state,
  busy,
  rpc,
  serverNow,
}: {
  state: HostState
  busy: boolean
  rpc: (name: string, args?: Record<string, unknown>, label?: string) => Promise<boolean>
  serverNow: () => number
}) {
  const running = state.call.status === 'running'
  const left = useCountdown(running ? state.call.startedAt : null, state.call.duration, serverNow)
  return (
    <div className="mt-3 flex flex-col items-center gap-3">
      {running ? (
        <CountdownRing left={left} duration={state.call.duration} size={130} />
      ) : (
        <p className="text-center text-sm text-white/75">Paula está eligiendo a quién llamar. Cuando conteste, inicia la cuenta atrás.</p>
      )}
      <div className="grid w-full grid-cols-2 gap-2">
        <button
          type="button"
          className="ctrl ctrl--gold !px-2 !text-xs"
          disabled={busy}
          onClick={() => void rpc('host_lifeline', { p_action: 'call_start', p_text: '30' }, 'call')}
        >
          <Timer size={15} /> {running ? 'Reiniciar 30 s' : 'Iniciar 30 s'}
        </button>
        <button
          type="button"
          className="ctrl ctrl--red !px-2 !text-xs"
          disabled={busy}
          onClick={() => void rpc('host_lifeline', { p_action: 'call_end' }, 'call')}
        >
          <PhoneOff size={15} /> Finalizar
        </button>
      </div>
    </div>
  )
}

function ChallengeControls({
  state,
  busy,
  rpc,
}: {
  state: HostState
  busy: boolean
  rpc: (name: string, args?: Record<string, unknown>, label?: string) => Promise<boolean>
}) {
  const [text, setText] = useState(state.hostChallengeText ?? '')
  const st = state.challenge.status
  return (
    <div className="mt-3 flex flex-col gap-2">
      {(st === 'pending' || st === 'shown') && (
        <>
          <label className="label" htmlFor="challenge-text">
            Reto para Paula
          </label>
          <textarea
            id="challenge-text"
            className="field min-h-[80px] resize-y text-sm"
            maxLength={500}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Escribe el reto o elige uno de abajo"
          />
          {st === 'pending' && <div className="flex flex-wrap gap-1.5">
            {CHALLENGE_PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                className="rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-left text-[0.68rem] text-white/75 hover:border-gold/50 hover:text-white"
                onClick={() => setText(p)}
              >
                {p}
              </button>
            ))}
          </div>}
          <button
            type="button"
            className="ctrl ctrl--gold !text-xs"
            disabled={busy || !text.trim()}
            onClick={() => void rpc('host_lifeline', { p_action: 'challenge_show', p_text: text }, 'challenge')}
          >
            <Eye size={15} /> {st === 'shown' ? 'Actualizar reto' : 'Mostrar reto a Paula'}
          </button>
        </>
      )}
      {st === 'shown' && (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            className="ctrl ctrl--green !px-2 !text-xs"
            disabled={busy}
            onClick={() => void rpc('host_lifeline', { p_action: 'challenge_pass' }, 'challenge')}
          >
            <CheckCircle2 size={15} /> Superada
          </button>
          <button
            type="button"
            className="ctrl ctrl--red !px-2 !text-xs"
            disabled={busy}
            onClick={() => void rpc('host_lifeline', { p_action: 'challenge_fail' }, 'challenge')}
          >
            <XCircle size={15} /> No superada
          </button>
        </div>
      )}
      {(st === 'passed' || st === 'failed' || st === 'pending') && (
        <button
          type="button"
          className="ctrl !text-xs"
          disabled={busy}
          onClick={() => void rpc('host_lifeline', { p_action: 'challenge_close' }, 'challenge')}
        >
          <Undo2 size={15} /> Volver a la pregunta
        </button>
      )}
    </div>
  )
}

function LinkPanel({ url, onRotate, notify }: { url: string; onRotate: () => void; notify: (t: 'error' | 'ok', m: string) => void }) {
  return (
    <section className="card mx-auto flex w-full max-w-3xl flex-col items-center gap-6 p-6 md:flex-row md:items-start">
      <div className="rounded-3xl bg-white p-4 shadow-[0_0_40px_rgba(248,189,50,0.4)]">
        <QRCodeSVG value={url} size={220} level="M" fgColor="#050B35" />
      </div>
      <div className="flex w-full min-w-0 flex-1 flex-col gap-4">
        <div>
          <h2 className="text-lg font-black uppercase tracking-wider text-gold-light">Enlace del jugador</h2>
          <p className="mt-1 text-sm text-white/70">
            Paula debe abrir este enlace (o escanear el QR) en su móvil. Es privado: contiene la clave de la partida.
          </p>
        </div>
        <div className="break-all rounded-xl border border-white/15 bg-night/70 px-3 py-2 font-mono text-xs text-white/85">{url}</div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="ctrl ctrl--gold"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(url)
                notify('ok', 'Enlace copiado')
              } catch {
                notify('error', 'No se pudo copiar. Selecciona el texto y cópialo a mano.')
              }
            }}
          >
            <Copy size={16} /> Copiar enlace
          </button>
          <a className="ctrl" href={url} target="_blank" rel="noreferrer">
            <ExternalLink size={16} /> Abrir vista del jugador
          </a>
          <button type="button" className="ctrl ctrl--ghost" onClick={onRotate}>
            <RefreshCw size={16} /> Generar enlace nuevo
          </button>
        </div>
      </div>
    </section>
  )
}
