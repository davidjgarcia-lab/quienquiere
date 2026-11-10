import { useCallback, useEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { errorMessage, supabase } from './supabase'

export type LinkStatus = 'connecting' | 'live' | 'offline'

interface Versioned {
  version: number
  serverTime: string
}

interface Options<T> {
  /** Clave del topic de Realtime (player_key). Sin ella no se suscribe. */
  topicKey: string | null
  /** Pide el estado completo al backend (RPC). */
  fetchState: (() => Promise<T>) | null
  role: 'player' | 'host'
}

/**
 * Sincronización de la partida:
 *  - Estado autoritativo siempre vía RPC (nunca se confía en el payload de Realtime).
 *  - Broadcast "state" desde la base de datos => se vuelve a pedir el estado.
 *  - Presence para saber si el jugador / presentador está conectado.
 *  - Sondeo de respaldo (rápido si Realtime cae) + refresco al volver a la pestaña o a la red.
 *  - Un único canal por topic: se eliminan canales previos antes de crear uno nuevo.
 */
export function useGameSync<T extends Versioned>({ topicKey, fetchState, role }: Options<T>) {
  const [state, setState] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [link, setLink] = useState<LinkStatus>('connecting')
  const [peers, setPeers] = useState({ player: false, host: false })
  const [loading, setLoading] = useState(true)

  const versionRef = useRef(-1)
  const fetchRef = useRef(fetchState)
  const inflight = useRef(false)
  const again = useRef(false)
  const clockOffset = useRef(0)
  const mounted = useRef(true)

  useEffect(() => {
    fetchRef.current = fetchState
  }, [fetchState])

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const accept = useCallback((s: T | null) => {
    if (!s || !mounted.current) return
    if (s.version >= versionRef.current) {
      versionRef.current = s.version
      setState(s)
    }
  }, [])

  const refresh = useCallback(async () => {
    const fn = fetchRef.current
    if (!fn) return
    if (inflight.current) {
      again.current = true
      return
    }
    inflight.current = true
    try {
      do {
        again.current = false
        const t0 = Date.now()
        const s = await fn()
        const t1 = Date.now()
        if (s?.serverTime) clockOffset.current = new Date(s.serverTime).getTime() - (t0 + t1) / 2
        accept(s)
        if (mounted.current) setError(null)
      } while (again.current)
    } catch (e) {
      if (mounted.current) setError(errorMessage(e))
    } finally {
      inflight.current = false
      if (mounted.current) setLoading(false)
    }
  }, [accept])

  /** Fuerza aceptar un estado aunque su versión sea menor (p. ej. tras cambiar de enlace). */
  const resetVersion = useCallback(() => {
    versionRef.current = -1
  }, [])

  // Carga inicial
  useEffect(() => {
    if (fetchState) void refresh()
  }, [fetchState, refresh])

  // Canal Realtime (broadcast + presence)
  useEffect(() => {
    if (!topicKey || !supabase) return
    const topic = `qqc:${topicKey}`
    for (const c of supabase.getChannels()) {
      if (c.topic === topic || c.topic === `realtime:${topic}`) void supabase.removeChannel(c)
    }
    const presenceKey = `${role}-${Math.random().toString(36).slice(2, 10)}`
    const channel: RealtimeChannel = supabase.channel(topic, {
      config: { broadcast: { self: false }, presence: { key: presenceKey } },
    })

    channel.on('broadcast', { event: 'state' }, (msg) => {
      const v = (msg.payload as { version?: number } | undefined)?.version
      if (typeof v !== 'number' || v > versionRef.current) void refresh()
    })
    channel.on('presence', { event: 'sync' }, () => {
      const ps = channel.presenceState<{ role: string }>()
      const all = Object.values(ps).flat()
      setPeers({
        player: all.some((p) => p.role === 'player'),
        host: all.some((p) => p.role === 'host'),
      })
    })
    channel.subscribe((status) => {
      if (!mounted.current) return
      if (status === 'SUBSCRIBED') {
        setLink('live')
        void channel.track({ role, at: Date.now() })
        void refresh() // ponerse al día tras (re)conexión
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        setLink('offline')
      }
    })
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [topicKey, role, refresh])

  // Sondeo de respaldo
  useEffect(() => {
    if (!fetchState) return
    const ms = link === 'live' ? 12000 : 2500
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh()
    }, ms)
    return () => window.clearInterval(id)
  }, [link, fetchState, refresh])

  // Volver a la pestaña / recuperar red
  useEffect(() => {
    const onWake = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    window.addEventListener('online', onWake)
    window.addEventListener('focus', onWake)
    document.addEventListener('visibilitychange', onWake)
    return () => {
      window.removeEventListener('online', onWake)
      window.removeEventListener('focus', onWake)
      document.removeEventListener('visibilitychange', onWake)
    }
  }, [refresh])

  const serverNow = useCallback(() => Date.now() + clockOffset.current, [])

  return { state, error, link, peers, loading, refresh, accept, serverNow, resetVersion }
}
