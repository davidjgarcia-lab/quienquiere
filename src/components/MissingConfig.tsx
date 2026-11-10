import { Stage } from './Stage'
import { Logo } from './Logo'

export function MissingConfig() {
  return (
    <>
      <Stage />
      <main className="relative z-10 mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center gap-6 px-6 text-center">
        <Logo variant="compact" />
        <h1 className="text-xl font-black uppercase text-gold-light">Falta configurar Supabase</h1>
        <p className="text-white/80">
          Define las variables <code className="text-gold">VITE_SUPABASE_URL</code> y{' '}
          <code className="text-gold">VITE_SUPABASE_PUBLISHABLE_KEY</code> en <code>.env.local</code> (local) o en
          Netlify → Site configuration → Environment variables, y vuelve a desplegar.
        </p>
      </main>
    </>
  )
}
