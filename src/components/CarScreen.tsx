import { useEffect, useState } from 'react'
import { useLang } from '../i18n/LangContext'
import { AppGlyphs, type GlyphKey } from './Icons'
import { COCKPIT } from '../cockpit/config'
import { useImage } from '../cockpit/CockpitArt'

function Clock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 15000)
    return () => clearInterval(id)
  }, [])
  return <span>{now.toLocaleTimeString('bg-BG', { hour: '2-digit', minute: '2-digit' })}</span>
}

/** Generated icon art if present in /images/icons, vector glyph otherwise. */
function AppIcon({ k }: { k: GlyphKey }) {
  const img = useImage(`/images/icons/${k}.webp`)
  return (
    <span className="app-tile">
      <img alt="" {...img.props} />
      {img.state !== 'ok' && (
        <svg viewBox="0 0 24 24" fill="none" aria-hidden>
          {AppGlyphs[k]}
        </svg>
      )}
    </span>
  )
}

// Mock route-risk profile (0..1 per km segment) for the sparkline
const PROFILE = [0.2, 0.25, 0.3, 0.22, 0.35, 0.5, 0.42, 0.38, 0.6, 0.85, 0.95, 0.7, 0.45, 0.3, 0.28, 0.4, 0.55, 0.35, 0.25, 0.2]
const color = (v: number) => (v > 0.75 ? 'var(--accent-danger)' : v > 0.45 ? 'var(--accent-signal)' : 'var(--accent-safe)')

/**
 * "Payner OS" — original infotainment UI. Sized with container-query
 * units so it scales with the screen rectangle in the cockpit image.
 */
export function CarScreen() {
  const { t } = useLang()
  const apps: GlyphKey[] = ['map', 'stats', 'pipeline', 'shield', 'team', 'route']
  const wallpaper = useImage(COCKPIT.images.wallpaper)

  return (
    <div className="screen" data-screen>
      <div className="screen__wall">
        <img alt="" {...wallpaper.props} />
      </div>

      <div className="screen__home" data-screen-home>
        <div className="screen__status">
          <Clock />
          <span className="screen__route">{t.screen.route}</span>
          <span>5G · 84%</span>
        </div>
        <div className="screen__main">
          <div className="risk-card" data-screen-widget>
            <p className="risk-card__eyebrow">{t.screen.riskTitle}</p>
            <svg className="risk-card__chart" viewBox="0 0 200 60" preserveAspectRatio="none" aria-hidden>
              {PROFILE.map((v, i) => (
                <rect key={i} x={i * 10 + 1} y={60 - v * 56} width="7" height={v * 56} rx="2" fill={color(v)} opacity={0.35 + v * 0.65} />
              ))}
              <path d="M0 59.5H200" stroke="#ffffff" strokeOpacity=".15" />
              <circle cx="16" cy="54" r="3.5" fill="#F4F4F5" />
            </svg>
            <p className="risk-card__next">{t.screen.riskNext}</p>
            <p className="risk-card__dist">{t.screen.riskDist}</p>
          </div>
          <ul className="screen__apps">
            {apps.map((a) => (
              <li key={a} data-app={a}>
                <AppIcon k={a} />
                <span className="app-label">{t.screen.apps[a]}</span>
              </li>
            ))}
          </ul>
        </div>
        <span className="screen__hint">{t.screen.hint}</span>
      </div>

      <div className="screen__boot" data-screen-boot>
        <div className="boot__logo">
          <svg viewBox="0 0 100 100" aria-hidden>
            <circle cx="50" cy="50" r="44" stroke="#ffffff" strokeOpacity=".1" strokeWidth="3" fill="none" />
            <circle className="boot__ring" cx="50" cy="50" r="44" stroke="var(--accent-signal)" strokeWidth="3" fill="none" pathLength={1} />
          </svg>
          <span className="boot__word">
            Payner<em>OS</em>
          </span>
        </div>
        <ol className="boot__log">
          {t.screen.boot.map((l, i) => (
            <li key={l} data-boot-line>
              <span className="boot__ok">{i === t.screen.boot.length - 1 ? '●' : '✓'}</span> {l}
            </li>
          ))}
        </ol>
      </div>
      <div className="screen__glare" />
    </div>
  )
}
