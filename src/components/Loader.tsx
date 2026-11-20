import { useEffect, useRef, useState } from 'react'
import { useProgress } from '@react-three/drei'
import gsap from 'gsap'
import { useLang } from '../i18n/LangContext'

/** Branded loader: the shield is "painted" like a road marking while assets load. */
export function Loader({ onDone }: { onDone: () => void }) {
  const { progress, active } = useProgress()
  const { t } = useLang()
  const root = useRef<HTMLDivElement>(null)
  const [shown, setShown] = useState(0)
  const counter = useRef({ v: 0 })
  const finished = useRef(false)

  // safety net: never block the page for more than 5s
  const [timedOut, setTimedOut] = useState(false)
  useEffect(() => {
    const id = setTimeout(() => setTimedOut(true), 5000)
    return () => clearTimeout(id)
  }, [])

  useEffect(() => {
    // never faster than ~1.4s so the intro reads as intentional
    const goal = active && !timedOut ? Math.min(progress, 96) : 100
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
  }, [progress, active, timedOut, onDone])

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
