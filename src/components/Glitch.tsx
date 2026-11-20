import { forwardRef, useImperativeHandle, useRef } from 'react'
import { mapCanvas } from '../scroll/store'

const SLICES = 14

export type GlitchHandle = { snapshot: () => void; set: (g: number) => void }

/**
 * Scroll-driven glitch: snapshots the live map, slices it into horizontal
 * bands, then RGB-splits and tears them apart as `g` goes 0 → 1.
 */
export const Glitch = forwardRef<GlitchHandle>(function Glitch(_, ref) {
  const root = useRef<HTMLDivElement>(null)
  const seeds = useRef(Array.from({ length: SLICES }, () => Math.random() * 2 - 1))

  useImperativeHandle(ref, () => ({
    snapshot() {
      const canvas = mapCanvas.get?.()
      if (!canvas || !root.current) return
      try {
        root.current.style.setProperty('--snap', `url(${canvas.toDataURL('image/jpeg', 0.7)})`)
      } catch {
        /* tainted canvas — fall back to gradient */
      }
    },
    set(g) {
      const el = root.current
      if (!el) return
      el.style.visibility = g > 0.001 ? 'visible' : 'hidden'
      el.style.setProperty('--g', String(g))
      const slices = el.querySelectorAll<HTMLElement>('.glitch__slice')
      const burst = Math.sin(g * Math.PI) // strongest in the middle
      slices.forEach((s, i) => {
        // re-randomise a few slices every update for a "live" tear
        if (Math.random() < 0.25) seeds.current[i] = Math.random() * 2 - 1
        const dx = seeds.current[i] * burst * 160
        s.style.transform = `translate3d(${dx}px,0,0)`
        s.style.opacity = String(1 - Math.max(0, g - 0.6) / 0.4)
      })
      const blocks = el.querySelectorAll<HTMLElement>('.glitch__block')
      blocks.forEach((b) => {
        b.style.opacity = burst > 0.2 && Math.random() > 0.4 ? '0.85' : '0'
        b.style.left = `${Math.random() * 90}%`
        b.style.top = `${Math.random() * 90}%`
        b.style.width = `${40 + Math.random() * 260}px`
      })
    },
  }))

  return (
    <div className="glitch" ref={root} aria-hidden>
      {Array.from({ length: SLICES }, (_, i) => (
        <div
          key={i}
          className="glitch__slice"
          style={{ top: `${(i / SLICES) * 100}%`, height: `${100 / SLICES + 0.2}%`, backgroundPositionY: `${(i / (SLICES - 1)) * 100}%` }}
        />
      ))}
      <div className="glitch__word">
        <span className="w w--c">SafetyCar</span>
        <span className="w w--m">SafetyCar</span>
        <span className="w">SafetyCar</span>
      </div>
      {['var(--glitch-cyan)', 'var(--glitch-magenta)', 'var(--accent-signal)', '#F4F4F5', 'var(--glitch-cyan)'].map((c, i) => (
        <i key={i} className="glitch__block" style={{ background: c, height: `${6 + i * 6}px` }} />
      ))}
      <div className="glitch__scan" />
    </div>
  )
})
