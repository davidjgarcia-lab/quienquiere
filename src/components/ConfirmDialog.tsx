import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef } from 'react'

interface Props {
  open: boolean
  title: string
  body?: React.ReactNode
  confirmLabel: string
  cancelLabel?: string
  tone?: 'danger' | 'gold'
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({ open, title, body, confirmLabel, cancelLabel = 'Cancelar', tone = 'gold', onConfirm, onCancel }: Props) {
  const cancelRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!open) return
    const prev = document.activeElement as HTMLElement | null
    cancelRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      prev?.focus?.()
    }
  }, [open, onCancel])
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[60] grid place-items-center bg-black/60 px-5 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onCancel}
        >
          <motion.div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            className="card w-full max-w-sm p-6 text-center"
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="confirm-title" className="text-lg font-black uppercase tracking-wide text-gold-light">
              {title}
            </h2>
            {body && <div className="mt-2 text-sm text-white/75">{body}</div>}
            <div className="mt-6 grid grid-cols-2 gap-3">
              <button ref={cancelRef} type="button" className="ctrl ctrl--ghost" onClick={onCancel}>
                {cancelLabel}
              </button>
              <button
                type="button"
                className={`ctrl ${tone === 'danger' ? 'ctrl--red' : 'ctrl--gold'}`}
                onClick={onConfirm}
              >
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
