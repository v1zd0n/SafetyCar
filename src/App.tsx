import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { LangProvider } from './i18n/LangContext'
import { useModelAvailable } from './three/modelAvailable'
import { HeroCar } from './components/HeroCar'
import { Nav } from './components/Nav'
import { Loader } from './components/Loader'
import { ApproachOverlay, HeroOverlay, InsideCaption } from './components/Overlays'
import { Cockpit } from './cockpit/Cockpit'
import { MapOverlay } from './components/MapOverlay'
import { Glitch, type GlitchHandle } from './components/Glitch'
import { Footer } from './components/Footer'
import { useLenis, useStory } from './scroll/useStory'
import './App.css'

// Mapbox is ~1.7 MB — load it only once the visitor starts the story
const MapView = lazy(() => import('./map/MapView'))
// three.js scene: only downloaded when a real GLB exists in /public/models/car.glb
const Experience = lazy(() => import('./three/Experience'))

function useLite() {
  const query = '(max-width: 768px), (pointer: coarse)'
  const [lite, setLite] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const on = () => setLite(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return lite
}

function Landing() {
  const lite = useLite()
  const [ready, setReady] = useState(false)
  const [sceneActive, setSceneActive] = useState(true)
  const [mapEnabled, setMapEnabled] = useState(false)
  const scope = useRef<HTMLDivElement>(null)
  const glitch = useRef<GlitchHandle>(null)
  const model = useModelAvailable()

  useLenis(ready)
  useStory({
    scope,
    glitch,
    ready,
    onSceneActive: setSceneActive,
    onMapEnabled: useCallback(() => setMapEnabled(true), []),
    model,
  })

  const onLoaded = useCallback(() => setReady(true), [])

  return (
    <div ref={scope}>
      {model === 'yes' ? (
        <Suspense fallback={null}>
          <Experience active={sceneActive} lite={lite} />
        </Suspense>
      ) : (
        // image-based studio + hero car (default until a GLB model is added)
        <div className="scene scene--studio">
          <HeroCar />
        </div>
      )}
      {!ready && <Loader onDone={onLoaded} />}
      <Nav />

      <section className="story" data-story>
        <div className="stage">
          <HeroOverlay />
          <ApproachOverlay />
          <div className="glass-pass" data-glass-pass aria-hidden />
          <Cockpit />
          <InsideCaption />
          {/* full-res map, clipped to the cockpit screen rect, then opened to fullscreen */}
          <div className="mapstage" data-mapstage>
            {mapEnabled && (
              <Suspense fallback={null}>
                <MapView enabled lite={lite} />
              </Suspense>
            )}
          </div>
          <MapOverlay />
          <Glitch ref={glitch} />
        </div>
      </section>

      <Footer />
      <div className="grain" aria-hidden />
    </div>
  )
}

export default function App() {
  return (
    <LangProvider>
      <Landing />
    </LangProvider>
  )
}
