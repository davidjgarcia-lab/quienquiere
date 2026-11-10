import { Music, Volume2, VolumeX } from 'lucide-react'
import { useSound } from '../lib/sound'

export function SoundToggle({ showMusic = true }: { showMusic?: boolean }) {
  const s = useSound()
  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => s.setEnabled(!s.enabled)}
        className="grid h-10 w-10 place-items-center rounded-full border border-white/20 bg-white/5 text-gold-light backdrop-blur transition hover:bg-white/10"
        aria-label={s.enabled ? 'Silenciar efectos' : 'Activar efectos de sonido'}
        title={s.enabled ? 'Silenciar efectos' : 'Activar efectos de sonido'}
      >
        {s.enabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
      </button>
      {showMusic && (
        <button
          type="button"
          onClick={() => s.setMusic(!s.music)}
          className={`grid h-10 w-10 place-items-center rounded-full border backdrop-blur transition hover:bg-white/10 ${
            s.music && s.enabled ? 'border-gold/60 bg-gold/15 text-gold-light' : 'border-white/20 bg-white/5 text-white/45'
          }`}
          aria-label={s.music ? 'Apagar música ambiente' : 'Encender música ambiente'}
          title={s.music ? 'Apagar música ambiente' : 'Encender música ambiente'}
        >
          <Music size={17} />
        </button>
      )}
    </div>
  )
}
