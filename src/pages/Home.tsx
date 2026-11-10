import { motion } from 'motion/react'
import { Link } from 'react-router-dom'
import { Gamepad2, MonitorPlay } from 'lucide-react'
import { Stage } from '../components/Stage'
import { Logo } from '../components/Logo'

export default function Home() {
  return (
    <>
      <Stage />
      <main className="safe-top safe-bottom relative z-10 mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-8 px-6 text-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.7, filter: 'blur(14px)' }}
          animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
          transition={{ duration: 1.1 }}
        >
          <Logo variant="hero" />
        </motion.div>
        <p className="text-white/85" style={{ textWrap: 'balance' }}>
          El concurso donde solo una persona puede demostrar que conoce a Adri de verdad.
        </p>
        <div className="flex w-full flex-col gap-3">
          <Link to="/presentador" className="btn-gold">
            <MonitorPlay size={18} /> Soy el presentador
          </Link>
          <Link to="/jugador" className="ctrl">
            <Gamepad2 size={18} /> Soy la concursante
          </Link>
        </div>
      </main>
    </>
  )
}
