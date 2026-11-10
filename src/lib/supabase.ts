import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY) as
  | string
  | undefined

export const isSupabaseConfigured = Boolean(url && key)

export const supabase: SupabaseClient = isSupabaseConfigured
  ? createClient(url!, key!, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'qqc-auth' },
      realtime: { params: { eventsPerSecond: 20 }, heartbeatIntervalMs: 15000 },
    })
  : (null as unknown as SupabaseClient)

/** Convierte cualquier error de Supabase/JS en un mensaje legible. */
export function errorMessage(e: unknown): string {
  if (!e) return 'Error desconocido'
  if (typeof e === 'string') return e
  if (typeof e === 'object' && 'message' in e && typeof (e as { message: unknown }).message === 'string') {
    const m = (e as { message: string }).message
    if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'Sin conexión. Reintentando…'
    return m
  }
  return 'Error desconocido'
}
