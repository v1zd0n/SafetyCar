import { useEffect, useRef } from 'react'
import { useLang } from '../i18n/LangContext'
import { CarScreen } from '../components/CarScreen'
import { COCKPIT, rectStyle, screenOrigin } from './config'
import { HudArt, InteriorArt, RoadArt, useImage } from './CockpitArt'

function Cluster() {
  const { t } = useLang()
  return (
    <div className="cluster" style={rectStyle(COCKPIT.cluster)} data-cluster>
      <span className="cluster__gear t-mono">D</span>
      <span className="cluster__speed" data-speed>
        0
      </span>
      <span className="cluster__unit t-mono">{t.cluster.unit}</span>
      <span className="cluster__risk">
        <span className="t-mono">{t.cluster.risk}</span>
        <i>
          <b data-risk-bar />
        </i>
      </span>
    </div>
  )
}

/**
 * 2.5D cockpit: road → HUD → interior → cluster/screen, all in the
 * interior image's pixel space so the DOM screen matches the picture.
 */
export function Cockpit() {
  const { t } = useLang()
  const root = useRef<HTMLDivElement>(null)
  const interior = useImage(COCKPIT.images.interior)
  const road = useImage(COCKPIT.images.road)

  // pointer parallax (cheap: two CSS variables)
  useEffect(() => {
    const el = root.current
    if (!el || window.matchMedia('(pointer: coarse)').matches) return
    let raf = 0
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        el.style.setProperty('--mx', String(e.clientX / innerWidth - 0.5))
        el.style.setProperty('--my', String(e.clientY / innerHeight - 0.5))
      })
    }
    window.addEventListener('pointermove', onMove)
    return () => window.removeEventListener('pointermove', onMove)
  }, [])

  return (
    <div className="cockpit" ref={root} data-cockpit aria-hidden>
      <div className="cockpit__frame" data-cockpit-frame style={{ transformOrigin: screenOrigin }}>
        <div className="cockpit__road" data-road>
          <img alt="" {...road.props} />
          {road.state !== 'ok' && <RoadArt />}
        </div>
        <div className="cockpit__hud" data-hud>
          <HudArt labels={t.hud} />
        </div>
        <div className="cockpit__interior">
          <img alt="" {...interior.props} />
          {interior.state !== 'ok' && <InteriorArt />}
        </div>
        <div className="cockpit__sweep" data-sweep />
        <Cluster />
        <div className="cockpit__screen" style={rectStyle(COCKPIT.screen)}>
          <CarScreen />
        </div>
      </div>
    </div>
  )
}
