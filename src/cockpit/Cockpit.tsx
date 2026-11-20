import { useEffect, useRef } from 'react'
import { useLang } from '../i18n/LangContext'
import { CarScreen } from '../components/CarScreen'
import { COCKPIT, rectStyle, screenOrigin } from './config'
import { HudArt, InteriorArt, RoadAR, RoadArt, useImage } from './CockpitArt'

function Cluster() {
  const { t } = useLang()
  return (
    <div className="cluster" style={rectStyle(COCKPIT.cluster)} data-cluster>
      <div className="cluster__speedo">
        <span className="cluster__speed" data-speed>
          0
        </span>
        <span className="cluster__unit">{t.cluster.unit}</span>
      </div>
      <div className="cluster__info">
        <div className="cluster__row">
          <i className="cluster__sign">50</i>
          <span>{t.cluster.limit}</span>
        </div>
        <div className="cluster__row">
          <span>{t.cluster.risk}</span>
          <i className="cluster__bar">
            <b data-risk-bar />
          </i>
          <em data-risk-label>{t.cluster.riskHigh}</em>
        </div>
      </div>
    </div>
  )
}

/**
 * 2.5D cockpit, all layers in the interior image's pixel space:
 *   road photo + AR beam (parallax layer A)
 *   HUD readout on the glass (parallax layer B)
 *   interior photo + screens (parallax layer C — screens move WITH the photo)
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
    <div className="cockpit" ref={root} data-cockpit aria-hidden style={{ ['--ar' as string]: COCKPIT.w / COCKPIT.h }}>
      <div className="cockpit__frame" data-cockpit-frame style={{ transformOrigin: screenOrigin }}>
        <div className="cockpit__layer cockpit__layer--road">
          <div className="cockpit__road" data-road>
            <img alt="" {...road.props} />
            {road.state !== 'ok' && <RoadArt />}
          </div>
          <div className="cockpit__ar" data-ar>
            <RoadAR label={t.hud.spot} />
          </div>
        </div>
        <div className="cockpit__layer cockpit__layer--hud" data-hud>
          <HudArt labels={t.hud} />
        </div>
        <div className="cockpit__layer cockpit__layer--interior">
          <img className="cockpit__photo" alt="" {...interior.props} />
          {interior.state !== 'ok' && <InteriorArt />}
          <div className="cockpit__sweep" data-sweep />
          {/* screens are transparent in the photo — "powered-off" glass until they boot */}
          <div className="cockpit__off" style={rectStyle(COCKPIT.cluster)} />
          <div className="cockpit__off" style={rectStyle(COCKPIT.screen)} />
          <Cluster />
          <div className="cockpit__screen" style={rectStyle(COCKPIT.screen)}>
            <CarScreen />
          </div>
        </div>
      </div>
    </div>
  )
}
