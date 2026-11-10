import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { MotionConfig } from 'motion/react'
import '@fontsource/montserrat/latin-500.css'
import '@fontsource/montserrat/latin-600.css'
import '@fontsource/montserrat/latin-700.css'
import '@fontsource/montserrat/latin-800.css'
import '@fontsource/montserrat/latin-900.css'
import '@fontsource/cinzel/latin-600.css'
import '@fontsource/cinzel/latin-800.css'
import '@fontsource/cinzel/latin-900.css'
import './index.css'
import { isSupabaseConfigured } from './lib/supabase'
import { MissingConfig } from './components/MissingConfig'
import { sound } from './lib/sound'

const Home = lazy(() => import('./pages/Home'))
const Player = lazy(() => import('./pages/Player'))
const Host = lazy(() => import('./pages/Host'))

// Desbloquea el audio en el primer toque (iOS/Android lo exigen).
const unlock = () => {
  sound.unlock()
  window.removeEventListener('pointerdown', unlock)
  window.removeEventListener('keydown', unlock)
}
window.addEventListener('pointerdown', unlock)
window.addEventListener('keydown', unlock)

const fallback = <div className="min-h-dvh bg-night" />

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      {isSupabaseConfigured ? (
        <BrowserRouter>
          <Suspense fallback={fallback}>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/presentador" element={<Host />} />
              <Route path="/jugador" element={<Player />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      ) : (
        <MissingConfig />
      )}
    </MotionConfig>
  </StrictMode>,
)
