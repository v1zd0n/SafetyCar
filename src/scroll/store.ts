import type { ScrollTrigger } from 'gsap/ScrollTrigger'
import type Lenis from 'lenis'
import { KEYFRAMES } from '../three/cameraPath'

/**
 * Mutable, non-React state shared between the GSAP timeline (writer)
 * and the R3F render loop (reader). Mutating plain objects avoids
 * re-rendering React 60 times per second.
 */
export const rig = {
  px: KEYFRAMES.hero.pos[0],
  py: KEYFRAMES.hero.pos[1],
  pz: KEYFRAMES.hero.pos[2],
  tx: KEYFRAMES.hero.target[0],
  ty: KEYFRAMES.hero.target[1],
  tz: KEYFRAMES.hero.target[2],
  /** 1 while on the hero (idle orbit + mouse parallax), fades to 0 on scroll */
  heroWeight: 1,
  /** 0..1 — interior screen glow intensity */
  screenGlow: 0,
}

export const story: { st: ScrollTrigger | null; lenis: Lenis | null } = { st: null, lenis: null }

/** Live map canvas (set by the lazily loaded MapView, read by the glitch snapshot). */
export const mapCanvas: { get: (() => HTMLCanvasElement | null) | null } = { get: null }

export type SectionId = 'intro' | 'problem' | 'how' | 'features' | 'team'

type Listener = (s: SectionId) => void
const listeners = new Set<Listener>()
let current: SectionId = 'intro'

export const sectionBus = {
  get: () => current,
  set(s: SectionId) {
    if (s === current) return
    current = s
    listeners.forEach((l) => l(s))
  },
  on(l: Listener) {
    listeners.add(l)
    return () => {
      listeners.delete(l)
    }
  },
}

export function scrollToLabel(label: string) {
  const st = story.st
  if (!st || !story.lenis) return
  const tl = st.animation as gsap.core.Timeline | undefined
  if (!tl) return
  const time = tl.labels[label]
  if (time === undefined) return
  const y = st.start + (st.end - st.start) * (time / tl.duration())
  story.lenis.scrollTo(y + 2, { duration: 2.2 })
}
