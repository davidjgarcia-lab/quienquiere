/**
 * Efectos de sonido 100 % originales generados en tiempo real con Web Audio API.
 * No se usan archivos ni música con derechos de autor.
 */
import { useSyncExternalStore } from 'react'

export type SfxName =
  | 'select'
  | 'lifeline'
  | 'reveal'
  | 'correct'
  | 'wrong'
  | 'transition'
  | 'final'
  | 'ring'
  | 'tick'
  | 'intro'
  | 'lock'

const STORAGE_KEY = 'qqc-sound'
const MUSIC_KEY = 'qqc-music'

class SoundEngine {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private musicGain: GainNode | null = null
  private musicTimer: number | null = null
  private listeners = new Set<() => void>()
  enabled: boolean
  music: boolean

  constructor() {
    const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null
    this.enabled = stored === null ? true : stored === '1'
    this.music = typeof localStorage !== 'undefined' && localStorage.getItem(MUSIC_KEY) === '1'
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }
  private emit() {
    this.listeners.forEach((l) => l())
  }
  snapshot = () => `${this.enabled ? 1 : 0}${this.music ? 1 : 0}`

  /** Debe llamarse tras un gesto del usuario (requisito de iOS/Android). */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      if (!AC) return
      this.ctx = new AC()
      this.master = this.ctx.createGain()
      this.master.gain.value = 0.55
      const comp = this.ctx.createDynamicsCompressor()
      this.master.connect(comp).connect(this.ctx.destination)
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume()
    if (this.music && this.enabled) this.startMusic()
  }

  setEnabled(v: boolean) {
    this.enabled = v
    localStorage.setItem(STORAGE_KEY, v ? '1' : '0')
    if (v) this.unlock()
    if (!v) this.stopMusic()
    else if (this.music) this.startMusic()
    this.emit()
  }

  setMusic(v: boolean) {
    this.music = v
    localStorage.setItem(MUSIC_KEY, v ? '1' : '0')
    if (v && this.enabled) {
      this.unlock()
      this.startMusic()
    } else this.stopMusic()
    this.emit()
  }

  // ---------------------------------------------------------------- utilidades
  private tone(
    freq: number,
    start: number,
    dur: number,
    opts: { type?: OscillatorType; gain?: number; to?: number; attack?: number; dest?: AudioNode } = {},
  ) {
    const ctx = this.ctx!
    const t = ctx.currentTime + start
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = opts.type ?? 'sine'
    osc.frequency.setValueAtTime(freq, t)
    if (opts.to) osc.frequency.exponentialRampToValueAtTime(opts.to, t + dur)
    const peak = opts.gain ?? 0.3
    const a = opts.attack ?? 0.01
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(peak, t + a)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    osc.connect(g).connect(opts.dest ?? this.master!)
    osc.start(t)
    osc.stop(t + dur + 0.05)
  }

  private noise(start: number, dur: number, opts: { gain?: number; filter?: number; q?: number; sweepTo?: number } = {}) {
    const ctx = this.ctx!
    const t = ctx.currentTime + start
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur))
    const buf = ctx.createBuffer(1, len, ctx.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
    const src = ctx.createBufferSource()
    src.buffer = buf
    const f = ctx.createBiquadFilter()
    f.type = 'bandpass'
    f.Q.value = opts.q ?? 1
    f.frequency.setValueAtTime(opts.filter ?? 1200, t)
    if (opts.sweepTo) f.frequency.exponentialRampToValueAtTime(opts.sweepTo, t + dur)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(opts.gain ?? 0.25, t + dur * 0.3)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    src.connect(f).connect(g).connect(this.master!)
    src.start(t)
    src.stop(t + dur + 0.05)
  }

  play(name: SfxName) {
    if (!this.enabled) return
    this.unlock()
    if (!this.ctx || !this.master) return
    switch (name) {
      case 'select':
        this.tone(523.25, 0, 0.12, { type: 'triangle', gain: 0.25 })
        this.tone(783.99, 0.07, 0.22, { type: 'triangle', gain: 0.22 })
        break
      case 'lock':
        this.tone(196, 0, 0.5, { type: 'sawtooth', gain: 0.12 })
        this.tone(392, 0, 0.5, { type: 'triangle', gain: 0.18 })
        this.noise(0, 0.25, { gain: 0.15, filter: 300 })
        break
      case 'lifeline':
        this.noise(0, 0.7, { gain: 0.3, filter: 400, sweepTo: 5000, q: 2 })
        this.tone(220, 0.05, 0.7, { type: 'sawtooth', gain: 0.1, to: 880 })
        this.tone(880, 0.55, 0.5, { type: 'triangle', gain: 0.25 })
        this.tone(1318.5, 0.62, 0.6, { type: 'sine', gain: 0.2 })
        break
      case 'reveal':
        for (let i = 0; i < 14; i++) this.noise(i * 0.06, 0.08, { gain: 0.08 + i * 0.012, filter: 2500, q: 0.7 })
        this.tone(110, 0, 1, { type: 'sine', gain: 0.25, to: 220 })
        break
      case 'correct': {
        const notes = [523.25, 659.25, 783.99, 1046.5]
        notes.forEach((n, i) => this.tone(n, i * 0.09, 0.9, { type: 'triangle', gain: 0.22 }))
        notes.forEach((n) => this.tone(n * 2, 0.4, 1.4, { type: 'sine', gain: 0.07, attack: 0.05 }))
        this.noise(0.36, 1.2, { gain: 0.05, filter: 8000, q: 0.5 })
        break
      }
      case 'wrong':
        this.tone(311, 0, 0.9, { type: 'sawtooth', gain: 0.14, to: 110 })
        this.tone(207.6, 0.02, 0.95, { type: 'square', gain: 0.07, to: 73 })
        this.noise(0, 0.5, { gain: 0.12, filter: 200 })
        break
      case 'transition':
        this.tone(90, 0, 1.2, { type: 'sine', gain: 0.45, to: 38 })
        this.noise(0, 0.9, { gain: 0.18, filter: 600, sweepTo: 6000, q: 1.5 })
        this.tone(659.25, 0.35, 1.1, { type: 'triangle', gain: 0.12 })
        this.tone(987.77, 0.45, 1.1, { type: 'sine', gain: 0.1 })
        break
      case 'intro': {
        const seq = [392, 523.25, 659.25, 783.99, 1046.5]
        seq.forEach((n, i) => this.tone(n, i * 0.12, 1.1, { type: 'triangle', gain: 0.2 }))
        this.tone(65.4, 0, 2, { type: 'sine', gain: 0.4 })
        this.noise(0.5, 1.6, { gain: 0.06, filter: 7000 })
        break
      }
      case 'final': {
        const chords = [
          [523.25, 659.25, 783.99],
          [587.33, 739.99, 880],
          [659.25, 830.61, 987.77],
          [783.99, 987.77, 1174.66, 1567.98],
        ]
        chords.forEach((c, i) => c.forEach((n) => this.tone(n, i * 0.32, i === 3 ? 2.2 : 0.4, { type: 'triangle', gain: 0.14 })))
        this.tone(65.4, 0.96, 2.2, { type: 'sine', gain: 0.35 })
        break
      }
      case 'ring':
        for (let i = 0; i < 2; i++) {
          for (let k = 0; k < 8; k++) {
            this.tone(440, i * 0.5 + k * 0.05, 0.04, { type: 'sine', gain: 0.12 })
            this.tone(480, i * 0.5 + k * 0.05, 0.04, { type: 'sine', gain: 0.12 })
          }
        }
        break
      case 'tick':
        this.tone(1600, 0, 0.04, { type: 'square', gain: 0.06 })
        break
    }
  }

  // ---------------------------------------------------------------- música ambiente
  private startMusic() {
    if (!this.ctx || !this.master || this.musicTimer !== null) return
    this.musicGain = this.ctx.createGain()
    this.musicGain.gain.value = 0.0001
    this.musicGain.gain.exponentialRampToValueAtTime(0.35, this.ctx.currentTime + 2)
    this.musicGain.connect(this.master)
    // Progresión original lenta (Am - F - C - G) con pad suave.
    const chords = [
      [220, 261.63, 329.63],
      [174.61, 220, 261.63],
      [130.81, 196, 261.63],
      [196, 246.94, 293.66],
    ]
    let step = 0
    const playChord = () => {
      if (!this.ctx || !this.musicGain) return
      const c = chords[step % chords.length]
      c.forEach((n) => {
        this.tone(n, 0, 3.8, { type: 'sine', gain: 0.09, attack: 1.2, dest: this.musicGain! })
        this.tone(n * 2, 0.2, 3.4, { type: 'triangle', gain: 0.02, attack: 1.5, dest: this.musicGain! })
      })
      this.tone(c[0] / 2, 0, 3.8, { type: 'sine', gain: 0.12, attack: 0.6, dest: this.musicGain! })
      step++
    }
    playChord()
    this.musicTimer = window.setInterval(playChord, 3600)
  }

  private stopMusic() {
    if (this.musicTimer !== null) window.clearInterval(this.musicTimer)
    this.musicTimer = null
    if (this.musicGain && this.ctx) {
      const g = this.musicGain
      g.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + 0.6)
      window.setTimeout(() => g.disconnect(), 800)
    }
    this.musicGain = null
  }
}

export const sound = new SoundEngine()

export function useSound() {
  useSyncExternalStore(sound.subscribe, sound.snapshot)
  return sound
}
