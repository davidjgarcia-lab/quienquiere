import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useState } from 'react'
import { ArrowDown, ArrowUp, CheckCircle2, Pencil, Plus, Trash2, X } from 'lucide-react'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { errorMessage, supabase } from '../lib/supabase'
import { LETTERS, type HostState, type QuestionRow } from '../lib/types'

type Draft = Omit<QuestionRow, 'id' | 'game_id' | 'position' | 'created_at' | 'is_sample'> & { id?: string }

const EMPTY: Draft = {
  question_text: '',
  answer_a: '',
  answer_b: '',
  answer_c: '',
  answer_d: '',
  correct_answer: 0,
  category: 'General',
  difficulty: 1,
  prize: '',
}

const ANSWER_KEYS = ['answer_a', 'answer_b', 'answer_c', 'answer_d'] as const

export default function QuestionsManager({
  gameId,
  state,
  notify,
}: {
  gameId: string
  state: HostState
  notify: (t: 'error' | 'ok', m: string) => void
}) {
  const [rows, setRows] = useState<QuestionRow[] | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<QuestionRow | 'samples' | null>(null)
  const [touched, setTouched] = useState(false)

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('questions')
      .select('*')
      .eq('game_id', gameId)
      .order('position')
      .order('created_at')
      .order('id')
    if (error) notify('error', errorMessage(error))
    else setRows(data as QuestionRow[])
  }, [gameId, notify])

  useEffect(() => {
    void load()
  }, [load, state.version])

  const inGame = state.status === 'playing'

  const save = async () => {
    if (!draft) return
    setTouched(true)
    if (!draft.question_text.trim() || ANSWER_KEYS.some((k) => !draft[k].trim())) return
    setSaving(true)
    const payload = {
      question_text: draft.question_text.trim(),
      answer_a: draft.answer_a.trim(),
      answer_b: draft.answer_b.trim(),
      answer_c: draft.answer_c.trim(),
      answer_d: draft.answer_d.trim(),
      correct_answer: draft.correct_answer,
      category: draft.category.trim() || 'General',
      difficulty: draft.difficulty,
      prize: draft.prize.trim(),
    }
    try {
      if (draft.id) {
        const { error } = await supabase.from('questions').update({ ...payload, is_sample: false }).eq('id', draft.id)
        if (error) throw error
        notify('ok', 'Pregunta guardada')
      } else {
        const maxPos = Math.max(0, ...(rows ?? []).map((r) => r.position))
        const { error } = await supabase.from('questions').insert({ ...payload, game_id: gameId, position: maxPos + 1 })
        if (error) throw error
        notify('ok', 'Pregunta añadida')
      }
      setDraft(null)
      setTouched(false)
      await load()
    } catch (e) {
      notify('error', errorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  const move = async (idx: number, dir: -1 | 1) => {
    if (!rows) return
    const next = [...rows]
    const j = idx + dir
    if (j < 0 || j >= next.length) return
    ;[next[idx], next[j]] = [next[j], next[idx]]
    setRows(next)
    const { error } = await supabase.rpc('host_reorder_questions', { p_game_id: gameId, p_ids: next.map((r) => r.id) })
    if (error) notify('error', errorMessage(error))
    await load()
  }

  const remove = async (target: QuestionRow | 'samples') => {
    const q = supabase.from('questions').delete().eq('game_id', gameId)
    const { error } = target === 'samples' ? await q.eq('is_sample', true) : await q.eq('id', target.id)
    if (error) notify('error', errorMessage(error))
    else notify('ok', target === 'samples' ? 'Preguntas de prueba eliminadas' : 'Pregunta eliminada')
    await load()
  }

  const samples = rows?.filter((r) => r.is_sample).length ?? 0
  const invalid = (v: string) => touched && !v.trim()

  return (
    <section className="flex flex-col gap-4">
      <div className="card flex flex-wrap items-center gap-3 p-4">
        <div className="mr-auto">
          <h2 className="text-lg font-black uppercase tracking-wider text-gold-light">Banco de preguntas</h2>
          <p className="text-sm text-white/65">
            {rows ? `${rows.length} preguntas` : 'Cargando…'}
            {samples > 0 && ` · ${samples} de prueba (sustitúyelas por las preguntas reales de Adri)`}
          </p>
        </div>
        {samples > 0 && (
          <button type="button" className="ctrl ctrl--ghost" onClick={() => setConfirmDelete('samples')}>
            <Trash2 size={16} /> Borrar las de prueba
          </button>
        )}
        <button
          type="button"
          className="ctrl ctrl--gold"
          onClick={() => {
            setTouched(false)
            setDraft({ ...EMPTY })
          }}
        >
          <Plus size={17} /> Añadir pregunta
        </button>
      </div>

      {inGame && (
        <p className="rounded-xl border border-select/50 bg-select/10 px-4 py-2 text-sm font-semibold text-orange-100">
          El concurso está en marcha. Si editas o reordenas preguntas, los cambios se verán al instante en el móvil de Paula.
        </p>
      )}

      <ol className="flex flex-col gap-2">
        {rows?.map((r, idx) => {
          const current = inGame && idx === state.questionIndex
          return (
            <li
              key={r.id}
              className={`card flex items-start gap-3 p-3 sm:p-4 ${current ? '!border-select/70' : ''}`}
            >
              <div className="flex flex-col items-center gap-1">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-gold/15 font-black text-gold-light">{idx + 1}</span>
                <button
                  type="button"
                  className="grid h-8 w-8 place-items-center rounded-lg text-white/60 hover:bg-white/10 disabled:opacity-20"
                  disabled={idx === 0}
                  onClick={() => move(idx, -1)}
                  aria-label="Subir pregunta"
                  title="Subir"
                >
                  <ArrowUp size={16} />
                </button>
                <button
                  type="button"
                  className="grid h-8 w-8 place-items-center rounded-lg text-white/60 hover:bg-white/10 disabled:opacity-20"
                  disabled={idx === (rows?.length ?? 0) - 1}
                  onClick={() => move(idx, 1)}
                  aria-label="Bajar pregunta"
                  title="Bajar"
                >
                  <ArrowDown size={16} />
                </button>
              </div>
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex flex-wrap gap-1.5 text-[0.65rem] font-bold uppercase tracking-wider">
                  <span className="rounded-full bg-white/10 px-2 py-0.5">{r.category}</span>
                  <span className="rounded-full bg-white/10 px-2 py-0.5">Dificultad {r.difficulty}</span>
                  {r.prize && <span className="rounded-full bg-gold/15 px-2 py-0.5 text-gold-light">{r.prize}</span>}
                  {r.is_sample && <span className="rounded-full bg-violet/50 px-2 py-0.5">Prueba</span>}
                  {current && <span className="rounded-full bg-select px-2 py-0.5 text-[#1b0b00]">En pantalla</span>}
                </div>
                <p className="font-bold leading-snug">{r.question_text}</p>
                <ul className="mt-2 grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
                  {ANSWER_KEYS.map((k, i) => (
                    <li
                      key={k}
                      className={`flex items-start gap-1.5 ${i === r.correct_answer ? 'font-bold text-correct' : 'text-white/70'}`}
                    >
                      <span className="font-black text-gold">{LETTERS[i]}:</span>
                      <span className="min-w-0 break-words">{r[k]}</span>
                      {i === r.correct_answer && <CheckCircle2 size={14} className="mt-0.5 shrink-0" />}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex flex-col gap-1">
                <button
                  type="button"
                  className="grid h-9 w-9 place-items-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white"
                  onClick={() => {
                    setTouched(false)
                    setDraft({ ...r })
                  }}
                  aria-label="Editar pregunta"
                  title="Editar"
                >
                  <Pencil size={16} />
                </button>
                <button
                  type="button"
                  className="grid h-9 w-9 place-items-center rounded-lg text-red-300/80 hover:bg-wrong/20 hover:text-red-200"
                  onClick={() => setConfirmDelete(r)}
                  aria-label="Eliminar pregunta"
                  title="Eliminar"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </li>
          )
        })}
        {rows?.length === 0 && (
          <li className="card p-8 text-center text-white/70">
            Todavía no hay preguntas. Pulsa «Añadir pregunta» para crear la primera.
          </li>
        )}
      </ol>

      {/* ---------------------------------------------------------- Editor */}
      <AnimatePresence>
        {draft && (
          <motion.div
            className="fixed inset-0 z-[55] flex justify-end bg-black/50 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => !saving && setDraft(null)}
          >
            <motion.form
              className="card flex h-full w-full max-w-xl flex-col gap-4 overflow-y-auto !rounded-none p-5 sm:!rounded-l-3xl"
              initial={{ x: 80 }}
              animate={{ x: 0 }}
              exit={{ x: 80 }}
              onClick={(e) => e.stopPropagation()}
              onSubmit={(e) => {
                e.preventDefault()
                void save()
              }}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-black uppercase tracking-wider text-gold-light">
                  {draft.id ? 'Editar pregunta' : 'Nueva pregunta'}
                </h3>
                <button
                  type="button"
                  className="grid h-9 w-9 place-items-center rounded-full hover:bg-white/10"
                  onClick={() => setDraft(null)}
                  aria-label="Cerrar editor"
                >
                  <X size={18} />
                </button>
              </div>
              <div>
                <label className="label" htmlFor="q-text">
                  Enunciado
                </label>
                <textarea
                  id="q-text"
                  className={`field min-h-[90px] ${invalid(draft.question_text) ? '!border-wrong' : ''}`}
                  maxLength={400}
                  value={draft.question_text}
                  onChange={(e) => setDraft({ ...draft, question_text: e.target.value })}
                />
                {invalid(draft.question_text) && <p className="mt-1 text-xs text-red-300">Escribe el enunciado.</p>}
              </div>
              <fieldset className="flex flex-col gap-3">
                <legend className="label">Respuestas (marca la correcta)</legend>
                {ANSWER_KEYS.map((k, i) => (
                  <div key={k} className="flex items-center gap-2">
                    <label
                      className={`grid h-11 w-11 shrink-0 cursor-pointer place-items-center rounded-xl border-2 font-black transition ${
                        draft.correct_answer === i ? 'border-correct bg-correct text-green-950' : 'border-white/20 text-gold'
                      }`}
                      title="Marcar como correcta"
                    >
                      <input
                        type="radio"
                        name="correct"
                        className="sr-only"
                        checked={draft.correct_answer === i}
                        onChange={() => setDraft({ ...draft, correct_answer: i })}
                        aria-label={`La respuesta ${LETTERS[i]} es la correcta`}
                      />
                      {LETTERS[i]}
                    </label>
                    <input
                      className={`field ${invalid(draft[k]) ? '!border-wrong' : ''}`}
                      maxLength={160}
                      value={draft[k]}
                      aria-label={`Respuesta ${LETTERS[i]}`}
                      onChange={(e) => setDraft({ ...draft, [k]: e.target.value })}
                    />
                  </div>
                ))}
                <p className="text-xs text-white/55">
                  Correcta: <b className="text-correct">{LETTERS[draft.correct_answer]}</b>. Pulsa una letra para cambiarla.
                </p>
              </fieldset>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className="label" htmlFor="q-cat">
                    Categoría
                  </label>
                  <input
                    id="q-cat"
                    className="field"
                    maxLength={40}
                    value={draft.category}
                    onChange={(e) => setDraft({ ...draft, category: e.target.value })}
                  />
                </div>
                <div>
                  <label className="label" htmlFor="q-diff">
                    Dificultad
                  </label>
                  <select
                    id="q-diff"
                    className="field"
                    value={draft.difficulty}
                    onChange={(e) => setDraft({ ...draft, difficulty: Number(e.target.value) })}
                  >
                    {[1, 2, 3, 4, 5].map((d) => (
                      <option key={d} value={d} className="bg-night">
                        {d} {d === 1 ? '(fácil)' : d === 5 ? '(muy difícil)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="q-prize">
                    Premio
                  </label>
                  <input
                    id="q-prize"
                    className="field"
                    maxLength={60}
                    value={draft.prize}
                    onChange={(e) => setDraft({ ...draft, prize: e.target.value })}
                  />
                </div>
              </div>
              <div className="mt-auto grid grid-cols-2 gap-3 pt-2">
                <button type="button" className="ctrl ctrl--ghost" onClick={() => setDraft(null)}>
                  Cancelar
                </button>
                <button type="submit" className="ctrl ctrl--gold" disabled={saving}>
                  {saving ? 'Guardando…' : draft.id ? 'Guardar cambios' : 'Añadir pregunta'}
                </button>
              </div>
            </motion.form>
          </motion.div>
        )}
      </AnimatePresence>

      <ConfirmDialog
        open={!!confirmDelete}
        title={confirmDelete === 'samples' ? '¿Borrar las preguntas de prueba?' : '¿Eliminar esta pregunta?'}
        body={
          confirmDelete === 'samples'
            ? `Se eliminarán ${samples} preguntas marcadas como prueba. Esta acción no se puede deshacer.`
            : confirmDelete
              ? `«${confirmDelete.question_text}». Esta acción no se puede deshacer.`
              : undefined
        }
        confirmLabel={confirmDelete === 'samples' ? 'Borrar de prueba' : 'Eliminar pregunta'}
        tone="danger"
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => {
          const t = confirmDelete
          setConfirmDelete(null)
          if (t) void remove(t)
        }}
      />
    </section>
  )
}
