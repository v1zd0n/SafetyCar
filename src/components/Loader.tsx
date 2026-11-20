import { useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { useLang } from '../i18n/LangContext'

/** Images the first screens need — preloaded behind the loader. */
const CRITICAL = [
  '/images/cockpit-interior.webp',
  '/images/cockpit-road.webp',
  '/images/payner-wallpaper.webp',
  ...['map', 'stats', 'pipeline', 'shield', 'team', 'route'].map((k) => `/images/icons/${k}.webp`),
]

function usePreload(urls: string[]) {
  const [done, setDone] = useState(0)
  useEffect(() => {
    let alive = true
    urls.forEach((src) => {
      const img = new Image()
      img.onload = img.onerror = () => alive && setDone((d) => d + 1)
      img.src = src
    })
    return () => {
      alive = false
    }
  }, [urls])
  return (done / urls.length) * 100
}

/** Branded loader: the shield is "painted" like a road marking while assets load. */
/** `waitFor` = the 3D scene has been created (its chunk is loaded lazily). */
export function Loader({ onDone, waitFor }: { onDone: () => void; waitFor: boolean }) {
  const progress = usePreload(CRITICAL)
  const { t } = useLang()
  const root = useRef<HTMLDivElement>(null)
  const [shown, setShown] = useState(0)
  const counter = useRef({ v: 0 })
  const finished = useRef(false)

  // safety net: never block the page for more than 6s
  const [timedOut, setTimedOut] = useState(false)
  useEffect(() => {
    const id = setTimeout(() => setTimedOut(true), 8000)
    return () => clearTimeout(id)
  }, [])

  useEffect(() => {
    // never faster than ~1.4s so the intro reads as intentional
    const goal = timedOut || (progress >= 100 && waitFor) ? 100 : Math.min(progress, 96)
    gsap.to(counter.current, {
      v: goal,
      duration: 1.4,
      ease: 'power2.out',
      onUpdate: () => setShown(Math.round(counter.current.v)),
      onComplete: () => {
        if (goal < 100 || finished.current || !root.current) return
        finished.current = true
        const tl = gsap.timeline({ onComplete: onDone })
        tl.to(root.current.querySelector('.loader__inner'), { y: -30, opacity: 0, duration: 0.6, ease: 'power3.in' })
        tl.to(root.current, { clipPath: 'inset(0 0 100% 0)', duration: 1, ease: 'expo.inOut' }, '-=0.1')
      },
    })
  }, [progress, waitFor, timedOut, onDone])

  return (
    <div className="loader" ref={root} aria-live="polite">
      <div className="loader__inner">
        <svg width="72" height="72" viewBox="0 0 28 28" fill="none" aria-hidden>
          <path
            d="M14 2 3 7v6.5C3 20 7.8 24.6 14 26c6.2-1.4 11-6 11-12.5V7L14 2Z"
            stroke="#F4F4F5"
            strokeWidth="1.2"
            pathLength={100}
            strokeDasharray="100"
            strokeDashoffset={100 - shown}
          />
          <path d="M14 8v4M14 15v4" stroke="var(--accent-signal)" strokeWidth="1.8" strokeLinecap="round" opacity={shown / 100} />
        </svg>
        <div className="loader__row">
          <span className="t-mono c-muted">{t.loader}</span>
          <span className="t-mono">{String(shown).padStart(3, '0')}%</span>
        </div>
        <div className="loader__bar">
          <span style={{ transform: `scaleX(${shown / 100})` }} />
        </div>
      </div>
    </div>
  )
}
