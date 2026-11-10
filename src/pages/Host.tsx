import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { motion } from 'motion/react'
import { LogIn, UserPlus } from 'lucide-react'
import { Stage } from '../components/Stage'
import { Logo } from '../components/Logo'
import { errorMessage, supabase } from '../lib/supabase'
import HostDashboard from './HostDashboard'

export default function Host() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [gameId, setGameId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  const uid = session?.user.id
  useEffect(() => {
    if (!uid) {
      setGameId(null)
      return
    }
    let cancelled = false
    const load = async (attempt = 0) => {
      const { data, error } = await supabase.rpc('host_ensure_game')
      if (cancelled) return
      if (error) {
        setError(errorMessage(error))
        if (attempt < 5) window.setTimeout(() => load(attempt + 1), 1500 * (attempt + 1))
        return
      }
      setError(null)
      setGameId(data as string)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [uid])

  if (session === undefined) return <Splash text="Cargando…" />
  if (!session) return <HostLogin />
  if (!gameId) return <Splash text={error ?? 'Preparando el plató…'} />
  return <HostDashboard gameId={gameId} email={session.user.email ?? ''} />
}

function Splash({ text }: { text: string }) {
  return (
    <>
      <Stage />
      <main className="relative z-10 grid min-h-dvh place-items-center px-6 text-center">
        <div className="flex flex-col items-center gap-5">
          <Logo variant="compact" />
          <span className="h-9 w-9 animate-spin rounded-full border-4 border-gold/30 border-t-gold" />
          <p className="font-bold text-white/80">{text}</p>
        </div>
      </main>
    </>
  )
}

function translateAuthError(m: string) {
  if (/invalid login credentials/i.test(m)) return 'Correo o contraseña incorrectos.'
  if (/email not confirmed/i.test(m)) return 'Confirma tu correo electrónico antes de entrar (revisa tu bandeja de entrada).'
  if (/already registered/i.test(m)) return 'Ya existe una cuenta con ese correo. Inicia sesión.'
  if (/password should be at least/i.test(m)) return 'La contraseña debe tener al menos 6 caracteres.'
  if (/rate limit/i.test(m)) return 'Demasiados intentos. Espera un momento y vuelve a probar.'
  return m
}

function HostLogin() {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'error' | 'ok'; text: string } | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/presentador` },
        })
        if (error) throw error
        if (!data.session)
          setMsg({ tone: 'ok', text: 'Cuenta creada. Revisa tu correo y pulsa el enlace de confirmación; después inicia sesión aquí.' })
      }
    } catch (err) {
      setMsg({ tone: 'error', text: translateAuthError(errorMessage(err)) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Stage />
      <main className="relative z-10 mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-8 px-5 py-10">
        <motion.div initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }}>
          <Logo variant="hero" />
        </motion.div>
        <form onSubmit={submit} className="card w-full space-y-4 p-6">
          <div className="text-center">
            <h1 className="text-lg font-black uppercase tracking-[0.18em] text-gold-light">Panel del presentador</h1>
            <p className="mt-1 text-sm text-white/65">
              {mode === 'login' ? 'Inicia sesión para controlar el concurso.' : 'Crea la cuenta del presentador.'}
            </p>
          </div>
          <div>
            <label className="label" htmlFor="email">
              Correo electrónico
            </label>
            <input
              id="email"
              className="field"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="password">
              Contraseña
            </label>
            <input
              id="password"
              className="field"
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              minLength={6}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {mode === 'signup' && <p className="mt-1 text-xs text-white/50">Mínimo 6 caracteres.</p>}
          </div>
          {msg && (
            <p
              role="alert"
              className={`rounded-xl px-3 py-2 text-sm font-semibold ${
                msg.tone === 'error' ? 'bg-wrong/15 text-red-200' : 'bg-correct/15 text-green-200'
              }`}
            >
              {msg.text}
            </p>
          )}
          <button type="submit" className="btn-gold w-full" disabled={busy}>
            {mode === 'login' ? <LogIn size={18} /> : <UserPlus size={18} />}
            {busy ? 'Un momento…' : mode === 'login' ? 'Entrar al plató' : 'Crear cuenta'}
          </button>
          <button
            type="button"
            className="w-full text-center text-sm font-semibold text-electric hover:text-white"
            onClick={() => {
              setMode(mode === 'login' ? 'signup' : 'login')
              setMsg(null)
            }}
          >
            {mode === 'login' ? '¿Primera vez? Crea la cuenta del presentador' : 'Ya tengo cuenta: iniciar sesión'}
          </button>
        </form>
      </main>
    </>
  )
}
