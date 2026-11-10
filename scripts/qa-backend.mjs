// Pruebas funcionales y de seguridad del backend contra un proyecto Supabase real.
// Uso: QA_EMAIL=... QA_PASSWORD=... NODE_USE_ENV_PROXY=1 node --env-file=.env.local scripts/qa-backend.mjs
import { createClient } from '@supabase/supabase-js'

const url = process.env.VITE_SUPABASE_URL
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY
const opts = { auth: { persistSession: false, autoRefreshToken: false } }
const host = createClient(url, key, opts)
const player = createClient(url, key, opts)

let pass = 0
let fail = 0
const ok = (cond, msg) => {
  if (cond) {
    pass++
    console.log('  ✔', msg)
  } else {
    fail++
    console.log('  ✘', msg)
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const must = async (p) => {
  const { data, error } = await p
  if (error) throw new Error(error.message)
  return data
}

console.log('\n▶ Autenticación del presentador')
const { error: authErr } = await host.auth.signInWithPassword({ email: process.env.QA_EMAIL, password: process.env.QA_PASSWORD })
ok(!authErr, 'login presentador ' + (authErr?.message ?? ''))
const gameId = await must(host.rpc('host_ensure_game'))
const gameId2 = await must(host.rpc('host_ensure_game'))
ok(gameId === gameId2, 'host_ensure_game es idempotente (misma partida tras recargar)')
const hs = (await must(host.rpc('host_get_state', { p_game_id: gameId })))
const pkey = hs.playerKey
ok(typeof pkey === 'string' && pkey.length === 32, 'clave de jugador de 128 bits')

console.log('\n▶ Seguridad: el jugador (anon) no puede leer tablas ni llamar funciones del presentador')
for (const t of ['questions', 'games', 'game_state']) {
  const { data, error } = await player.from(t).select('*')
  ok(error || (Array.isArray(data) && data.length === 0), `anon no lee ${t} (${error ? error.code : 'vacío'})`)
}
for (const fn of ['host_get_state', 'host_reveal', 'host_reset_game', 'host_next_question']) {
  const { error } = await player.rpc(fn, { p_game_id: gameId })
  ok(!!error, `anon no puede ejecutar ${fn}`)
}
const { error: privErr } = await player.rpc('_qqc_public_state', { p_game_id: gameId })
ok(!!privErr, 'funciones internas no expuestas')
const { error: badKey } = await player.rpc('player_get_state', { p_key: 'x'.repeat(32) })
ok(!!badKey, 'clave inválida rechazada')

console.log('\n▶ Realtime: suscripción del jugador')
let events = 0
let lastEventAt = 0
const ch = player.channel(`qqc:${pkey}`, { config: { presence: { key: 'player-qa' } } })
ch.on('broadcast', { event: 'state' }, () => {
  events++
  lastEventAt = Date.now()
})
let hostSeesPlayer = false
const hch = host.channel(`qqc:${pkey}`, { config: { presence: { key: 'host-qa' } } })
hch.on('presence', { event: 'sync' }, () => {
  hostSeesPlayer = Object.values(hch.presenceState()).flat().some((p) => p.role === 'player')
})
await new Promise((res) => hch.subscribe((s) => s === 'SUBSCRIBED' && res()))
await new Promise((res) =>
  ch.subscribe(async (s) => {
    if (s === 'SUBSCRIBED') {
      await ch.track({ role: 'player' })
      res()
    }
  }),
)
for (let i = 0; i < 40 && !hostSeesPlayer; i++) await sleep(200)
ok(hostSeesPlayer, 'el presentador ve a la jugadora conectada (presence)')

console.log('\n▶ Partida completa')
await must(host.rpc('host_reset_game', { p_game_id: gameId }))
let ps = await must(player.rpc('player_get_state', { p_key: pkey }))
ok(ps.status === 'lobby' && ps.question === null, 'estado inicial: lobby sin pregunta')

let before = events
let t0 = Date.now()
await must(host.rpc('host_start_game', { p_game_id: gameId }))
await sleep(1200)
ok(events > before, `jugador recibe evento al empezar (latencia ~${lastEventAt - t0} ms)`)
ps = await must(player.rpc('player_get_state', { p_key: pkey }))
ok(ps.status === 'playing' && ps.question?.text, 'pregunta 1 visible para el jugador')
ok(ps.correctAnswer === null && !('hostCorrectAnswer' in ps) && !JSON.stringify(ps).includes('correct_answer'), 'la respuesta correcta NO está en el estado del jugador')

const { error: revealNoSel } = await host.rpc('host_reveal', { p_game_id: gameId })
ok(!!revealNoSel, 'no se puede revelar sin respuesta seleccionada')

before = events
t0 = Date.now()
ps = await must(player.rpc('player_select_answer', { p_key: pkey, p_answer: 1 }))
ok(ps.selectedAnswer === 1, 'selección B registrada')
let h = await must(host.rpc('host_get_state', { p_game_id: gameId }))
ok(h.selectedAnswer === 1, 'el presentador ve la B seleccionada')
await sleep(800)
ok(events > before, `evento de selección emitido (~${lastEventAt - t0} ms)`)
ps = await must(player.rpc('player_select_answer', { p_key: pkey, p_answer: 3 }))
ok(ps.selectedAnswer === 3, 'la jugadora puede cambiar a la D antes del bloqueo')

// 50:50
const correct1 = h.hostCorrectAnswer
ps = await must(player.rpc('player_use_lifeline', { p_key: pkey, p_kind: 'fifty' }))
ok(ps.lifelines.fifty === true, '50:50 marcado como usado')
ok(ps.eliminatedAnswers.length === 2, '50:50 elimina exactamente 2 respuestas')
ok(!ps.eliminatedAnswers.includes(correct1), '50:50 nunca elimina la correcta')
ok(ps.correctAnswer === null, '50:50 no revela la correcta')
if (ps.eliminatedAnswers.includes(3)) ok(ps.selectedAnswer === null, 'si la seleccionada se elimina, se deselecciona')
const { error: again5050 } = await player.rpc('player_use_lifeline', { p_key: pkey, p_kind: 'fifty' })
ok(!!again5050, '50:50 no se puede usar dos veces')
const { error: selElim } = await player.rpc('player_select_answer', { p_key: pkey, p_answer: ps.eliminatedAnswers[0] })
ok(!!selElim, 'no se puede elegir una respuesta eliminada')

// Llamada
ps = await must(player.rpc('player_use_lifeline', { p_key: pkey, p_kind: 'call' }))
ok(ps.activeLifeline === 'call' && ps.lifelines.call && ps.call.status === 'ringing', 'llamada activa (ringing)')
const { error: selDuringCall } = await player.rpc('player_select_answer', { p_key: pkey, p_answer: correct1 })
ok(!!selDuringCall, 'no se puede responder durante la llamada')
await must(host.rpc('host_lifeline', { p_game_id: gameId, p_action: 'call_start', p_text: '30' }))
ps = await must(player.rpc('player_get_state', { p_key: pkey }))
ok(ps.call.status === 'running' && ps.call.startedAt && ps.call.duration === 30, 'cuenta atrás de 30 s iniciada')
await must(host.rpc('host_lifeline', { p_game_id: gameId, p_action: 'call_end' }))
ps = await must(player.rpc('player_get_state', { p_key: pkey }))
ok(ps.activeLifeline === null && ps.lifelines.call, 'llamada finalizada, comodín gastado')
const { error: againCall } = await player.rpc('player_use_lifeline', { p_key: pkey, p_kind: 'call' })
ok(!!againCall, 'la llamada no se puede usar dos veces')

// Selección correcta + bloqueo + revelación
ps = await must(player.rpc('player_select_answer', { p_key: pkey, p_answer: correct1 }))
await must(host.rpc('host_set_lock', { p_game_id: gameId, p_locked: true }))
const { error: changeLocked } = await player.rpc('player_select_answer', { p_key: pkey, p_answer: ps.eliminatedAnswers.includes(0) ? 1 : 0 })
ok(!!changeLocked, 'con la respuesta bloqueada, la jugadora no puede cambiarla')
const { error: nextEarly } = await host.rpc('host_next_question', { p_game_id: gameId })
ok(!!nextEarly, 'no se puede avanzar sin revelar')
await must(host.rpc('host_reveal', { p_game_id: gameId }))
ps = await must(player.rpc('player_get_state', { p_key: pkey }))
ok(ps.answerRevealed && ps.correctAnswer === correct1, 'tras revelar, la jugadora recibe la correcta')
ok(ps.correctCount === 1, 'acierto contabilizado')

// Pregunta 2: prueba + fallo
await must(host.rpc('host_next_question', { p_game_id: gameId }))
ps = await must(player.rpc('player_get_state', { p_key: pkey }))
ok(ps.questionIndex === 1 && !ps.answerRevealed && ps.selectedAnswer === null, 'pregunta 2 limpia')
ok(ps.lifelines.fifty && ps.lifelines.call && !ps.lifelines.challenge, 'los comodines gastados siguen gastados al avanzar')
ok(ps.eliminatedAnswers.length === 0, 'el 50:50 no se arrastra a la nueva pregunta')
ps = await must(player.rpc('player_use_lifeline', { p_key: pkey, p_kind: 'challenge' }))
ok(ps.activeLifeline === 'challenge' && ps.challenge.status === 'pending' && ps.challenge.text === null, 'prueba activa (pendiente)')
await must(host.rpc('host_lifeline', { p_game_id: gameId, p_action: 'challenge_show', p_text: 'Reto QA' }))
ps = await must(player.rpc('player_get_state', { p_key: pkey }))
ok(ps.challenge.status === 'shown' && ps.challenge.text === 'Reto QA', 'la jugadora ve el reto personalizado')
await must(host.rpc('host_lifeline', { p_game_id: gameId, p_action: 'challenge_pass' }))
await must(host.rpc('host_lifeline', { p_game_id: gameId, p_action: 'challenge_close' }))
ps = await must(player.rpc('player_get_state', { p_key: pkey }))
ok(ps.activeLifeline === null && ps.lifelines.challenge && ps.challenge.status === 'passed', 'prueba superada y vuelta a la pregunta')
h = await must(host.rpc('host_get_state', { p_game_id: gameId }))
const wrong2 = [0, 1, 2, 3].find((i) => i !== h.hostCorrectAnswer)
await must(player.rpc('player_select_answer', { p_key: pkey, p_answer: wrong2 }))
await must(host.rpc('host_reveal', { p_game_id: gameId }))
ps = await must(player.rpc('player_get_state', { p_key: pkey }))
ok(ps.selectedAnswer === wrong2 && ps.correctAnswer === h.hostCorrectAnswer && ps.correctCount === 1, 'fallo: elegida en rojo y correcta en verde')

// Reinicio de pregunta
await must(host.rpc('host_reset_question', { p_game_id: gameId }))
ps = await must(player.rpc('player_get_state', { p_key: pkey }))
ok(!ps.answerRevealed && ps.selectedAnswer === null && ps.correctAnswer === null && ps.results.length === 1, 'reiniciar pregunta borra respuesta y resultado, oculta la correcta')
ok(ps.lifelines.challenge, 'reiniciar pregunta mantiene comodines gastados')

// 50:50 aleatorio (estadística en distintas partidas)
const combos = new Set()
for (let i = 0; i < 8; i++) {
  await must(host.rpc('host_lifeline', { p_game_id: gameId, p_action: 'restore_fifty' }))
  const s = await must(player.rpc('player_use_lifeline', { p_key: pkey, p_kind: 'fifty' }))
  ok(s.eliminatedAnswers.length === 2 && !s.eliminatedAnswers.includes(h.hostCorrectAnswer), `50:50 ronda ${i + 1}: ${s.eliminatedAnswers}`)
  combos.add(s.eliminatedAnswers.join())
}
ok(combos.size > 1, `50:50 aleatorio (${combos.size} combinaciones distintas)`)

// Concurrencia: muchas selecciones simultáneas => estado consistente
await must(host.rpc('host_reset_question', { p_game_id: gameId }))
await must(host.rpc('host_lifeline', { p_game_id: gameId, p_action: 'restore_fifty' }))
const results = await Promise.all(
  [0, 1, 2, 3, 0, 1, 2, 3].map((a) => player.rpc('player_select_answer', { p_key: pkey, p_answer: a })),
)
ok(results.every((r) => !r.error), 'selecciones concurrentes sin errores')
await Promise.all([
  host.rpc('host_set_lock', { p_game_id: gameId, p_locked: true }),
  player.rpc('player_select_answer', { p_key: pkey, p_answer: 2 }),
])
h = await must(host.rpc('host_get_state', { p_game_id: gameId }))
ok(h.answerLocked && h.selectedAnswer !== null, 'bloqueo concurrente deja un estado coherente')

// Recarga del presentador (cliente nuevo)
const host2 = createClient(url, key, opts)
await host2.auth.signInWithPassword({ email: process.env.QA_EMAIL, password: process.env.QA_PASSWORD })
const g3 = await must(host2.rpc('host_ensure_game'))
const h2 = await must(host2.rpc('host_get_state', { p_game_id: g3 }))
ok(g3 === gameId && h2.questionIndex === 1 && h2.answerLocked, 'el presentador recupera la partida tras recargar')

// Final de partida
await must(host.rpc('host_reveal', { p_game_id: gameId }))
const total = h.totalQuestions
for (let i = h.questionIndex; i < total - 1; i++) {
  await must(host.rpc('host_next_question', { p_game_id: gameId }))
  await must(player.rpc('player_select_answer', { p_key: pkey, p_answer: 0 }))
  await must(host.rpc('host_reveal', { p_game_id: gameId }))
}
await must(host.rpc('host_next_question', { p_game_id: gameId }))
ps = await must(player.rpc('player_get_state', { p_key: pkey }))
ok(ps.status === 'finished' && ps.results.length === total, `pantalla final con ${ps.correctCount}/${total} aciertos`)

await must(host.rpc('host_reset_game', { p_game_id: gameId }))
ps = await must(player.rpc('player_get_state', { p_key: pkey }))
ok(ps.status === 'lobby' && !ps.lifelines.fifty && !ps.lifelines.call && !ps.lifelines.challenge && ps.results.length === 0, 'reiniciar partida: todo al estado inicial')

// Aislamiento entre presentadores: otro usuario no puede tocar esta partida
const { error: crossErr } = await player.rpc('host_reveal', { p_game_id: gameId })
ok(!!crossErr, 'sin sesión no se controla la partida')

await player.removeAllChannels()
await host.removeAllChannels()
console.log(`\nResultado: ${pass} OK, ${fail} fallos. Eventos realtime recibidos: ${events}`)
process.exit(fail ? 1 : 0)
