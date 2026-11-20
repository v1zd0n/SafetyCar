import { useEffect, useRef, type RefObject } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useGSAP } from '@gsap/react'
import Lenis from 'lenis'
import { KEYFRAMES, type Keyframe } from '../three/cameraPath'
import { rig, sectionBus, story, type SectionId } from './store'
import type { GlitchHandle } from '../components/Glitch'

gsap.registerPlugin(ScrollTrigger, useGSAP)

// dev-only handle for debugging / automated screenshots
if (import.meta.env.DEV) (window as unknown as { __sc: unknown }).__sc = { gsap, story, rig }

/** Timeline positions (in timeline seconds — scroll distance is proportional). */
export const T = {
  hero: 0,
  approach: 1.2,
  glass: 2.3,
  inside: 2.8,
  ignition: 3.2,
  boot: 4.1,
  mapOpen: 5.6,
  problem: 6.9,
  how: 8.3,
  features: 9.7,
  team: 11.1,
  glitch: 12.2,
  end: 13.4,
}

function sectionAt(time: number): SectionId {
  if (time < T.problem - 0.2) return 'intro'
  if (time < T.how - 0.1) return 'problem'
  if (time < T.features - 0.1) return 'how'
  if (time < T.team - 0.1) return 'features'
  return 'team'
}

type Opts = {
  scope: RefObject<HTMLElement | null>
  glitch: RefObject<GlitchHandle | null>
  ready: boolean
  onSceneActive: (on: boolean) => void
  onMapEnabled: () => void
}

export function useLenis(ready: boolean) {
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const lenis = new Lenis({ duration: reduce ? 0.6 : 1.25, smoothWheel: !reduce })
    story.lenis = lenis
    lenis.on('scroll', ScrollTrigger.update)
    const tick = (time: number) => lenis.raf(time * 1000)
    gsap.ticker.add(tick)
    gsap.ticker.lagSmoothing(0)
    return () => {
      gsap.ticker.remove(tick)
      lenis.destroy()
      story.lenis = null
    }
  }, [])

  useEffect(() => {
    if (!story.lenis) return
    if (ready) story.lenis.start()
    else story.lenis.stop()
  }, [ready])
}

export function useStory({ scope, glitch, ready, onSceneActive, onMapEnabled }: Opts) {
  const sceneOn = useRef(true)
  const mapOn = useRef(false)

  // Intro reveal once the loader has gone
  useGSAP(
    () => {
      if (!ready) return
      gsap.from('[data-line]', { yPercent: 110, duration: 1.4, ease: 'expo.out', stagger: 0.08, delay: 0.2 })
      gsap.from('[data-reveal]', { opacity: 0, y: 24, duration: 1.2, ease: 'power3.out', stagger: 0.08, delay: 0.5 })
      gsap.from('.nav', { opacity: 0, y: -20, duration: 1, ease: 'power3.out', delay: 0.4 })
    },
    { scope, dependencies: [ready] },
  )

  useGSAP(
    () => {
      const root = scope.current!
      const q = <E extends Element = HTMLElement>(s: string) => root.querySelector<E>(s)
      const frame = q('[data-cockpit-frame]')!
      const screenBox = q('.cockpit__screen')!
      const mapstage = q('[data-mapstage]')!
      const speedEl = q('[data-speed]')!
      const cam = (k: Keyframe, at: number, duration: number, ease = 'power2.inOut') =>
        tl.to(rig, { px: k.pos[0], py: k.pos[1], pz: k.pos[2], tx: k.target[0], ty: k.target[1], tz: k.target[2], duration, ease }, at)

      /** scale that makes the cockpit screen cover the viewport */
      const fillScale = () => {
        const sw = (screenBox.offsetWidth || 1) * 1.02
        const sh = (screenBox.offsetHeight || 1) * 1.02
        return Math.max(innerWidth / sw, innerHeight / sh)
      }

      /** clip the full-res map to wherever the cockpit screen is right now */
      const clipMap = () => {
        const r = screenBox.getBoundingClientRect()
        const top = Math.max(0, r.top)
        const left = Math.max(0, r.left)
        const right = Math.max(0, innerWidth - r.right)
        const bottom = Math.max(0, innerHeight - r.bottom)
        const radius = 18 * Math.max(0, Math.min(1, (innerWidth - r.width) / (innerWidth * 0.4)))
        mapstage.style.clipPath = `inset(${top}px ${right}px ${bottom}px ${left}px round ${radius}px)`
      }

      const speed = { v: 0 }
      const glitchProxy = { g: 0 }

      const tl = gsap.timeline({
        defaults: { ease: 'none' },
        scrollTrigger: {
          trigger: '[data-story]',
          start: 'top top',
          end: 'bottom bottom',
          scrub: 1,
          invalidateOnRefresh: true,
          onRefresh: clipMap,
        },
        // timeline-level onUpdate also fires while scrub is catching up (ScrollTrigger's only fires on scroll events)
        onUpdate: () => {
          const time = tl.time()
          sectionBus.set(sectionAt(time))
          const active = time < T.inside + 0.2
          if (active !== sceneOn.current) {
            sceneOn.current = active
            onSceneActive(active)
          }
          if (!mapOn.current && time > T.approach + 0.8) {
            mapOn.current = true
            onMapEnabled()
          }
          if (time > T.boot) clipMap()
        },
      })
      story.st = tl.scrollTrigger ?? null
      Object.entries(T).forEach(([k, v]) => tl.addLabel(k, v))

      // ---------- 01 Hero → side orbit ----------
      tl.to('.hero__left', { yPercent: -40, opacity: 0, duration: 0.8, ease: 'power2.in' }, 0.05)
      tl.to('.hero__right, .hero__scroll, .hero__meta', { y: -40, opacity: 0, duration: 0.6, ease: 'power2.in' }, 0)
      tl.to(rig, { heroWeight: 0, duration: 0.8 }, 0)
      cam(KEYFRAMES.side, 0, 1.2)

      // ---------- 02 Approach → through the glass ----------
      cam(KEYFRAMES.approach, T.approach, 1.1)
      tl.fromTo('[data-approach]', { opacity: 0 }, { opacity: 1, duration: 0.3 }, T.approach + 0.1)
      tl.fromTo('.approach__title', { scale: 1.15, filter: 'blur(12px)' }, { scale: 1, filter: 'blur(0px)', duration: 0.7, ease: 'power3.out' }, T.approach + 0.1)
      tl.to('[data-approach]', { opacity: 0, duration: 0.3 }, T.glass - 0.2)
      cam(KEYFRAMES.glass, T.glass, 0.45, 'power2.in')
      tl.to('.scene', { filter: 'blur(14px) brightness(1.6)', duration: 0.3, ease: 'power2.in' }, T.glass + 0.15)
      tl.fromTo('[data-glass-pass]', { opacity: 0 }, { opacity: 1, duration: 0.15, ease: 'power2.in' }, T.glass + 0.2)
      tl.to('[data-glass-pass]', { opacity: 0, duration: 0.4, ease: 'power2.out' }, T.glass + 0.36)
      tl.to('.scene', { opacity: 0, duration: 0.1 }, T.glass + 0.33)

      // ---------- 03 Cockpit: settle + ignition ----------
      tl.fromTo('[data-cockpit]', { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.12 }, T.glass + 0.3)
      tl.fromTo(frame, { scale: 1.22, filter: 'blur(10px) brightness(0.4)' }, { scale: 1, filter: 'blur(0px) brightness(1)', duration: 0.7, ease: 'power3.out' }, T.glass + 0.3)
      tl.fromTo('[data-inside-line]', { opacity: 0, y: 30 }, { opacity: 1, y: 0, stagger: 0.1, duration: 0.35, ease: 'power3.out' }, T.inside + 0.1)

      tl.fromTo('.ambient', { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.6, ease: 'power2.inOut' }, T.ignition)
      // sweep is 40% wide, so xPercent 260 carries it fully past the right edge
      tl.fromTo('[data-sweep]', { xPercent: -110, opacity: 1 }, { xPercent: 260, duration: 0.7, ease: 'power1.inOut' }, T.ignition)
      tl.to('[data-sweep]', { opacity: 0, duration: 0.1 }, T.ignition + 0.7)
      tl.fromTo('[data-cluster]', { opacity: 0 }, { opacity: 1, duration: 0.15 }, T.ignition + 0.1)
      // cruising speed comes up first; once the AR warning appears the car is "over the limit"
      const writeSpeed = () => {
        speedEl.textContent = String(Math.round(speed.v))
        speedEl.classList.toggle('is-over', speed.v > 50)
      }
      tl.fromTo(speed, { v: 0 }, { v: 87, duration: 0.55, ease: 'power2.out', onUpdate: writeSpeed }, T.ignition + 0.15)
      tl.fromTo('[data-risk-bar]', { scaleX: 0 }, { scaleX: 0.86, duration: 0.45, ease: 'power2.out' }, T.ignition + 0.5)
      tl.fromTo('[data-risk-label]', { opacity: 0 }, { opacity: 1, duration: 0.15 }, T.ignition + 0.8)
      tl.fromTo('[data-ar]', { opacity: 0 }, { opacity: 1, duration: 0.25 }, T.ignition + 0.4)
      tl.fromTo('.ar-ribbon', { opacity: 0, scaleY: 0.2, transformOrigin: '50% 100%' }, { opacity: 1, scaleY: 1, duration: 0.45, ease: 'power3.out' }, T.ignition + 0.4)
      tl.fromTo('.ar-hazard', { opacity: 0, scale: 0.4, transformOrigin: '50% 50%' }, { opacity: 1, scale: 1, duration: 0.3, ease: 'back.out(2)' }, T.ignition + 0.7)
      tl.fromTo('[data-hud]', { opacity: 0 }, { opacity: 1, duration: 0.3 }, T.ignition + 0.55)
      tl.fromTo('.hud-card', { opacity: 0, x: -20 }, { opacity: 1, x: 0, duration: 0.3, ease: 'power3.out' }, T.ignition + 0.6)

      // ---------- Payner OS boot → home ----------
      tl.fromTo('[data-screen]', { opacity: 0 }, { opacity: 1, duration: 0.15 }, T.boot - 0.1)
      tl.fromTo('[data-screen-boot]', { opacity: 0 }, { opacity: 1, duration: 0.1 }, T.boot)
      tl.fromTo('.boot__ring', { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.7, ease: 'power1.inOut' }, T.boot)
      tl.fromTo('.boot__word', { opacity: 0, scale: 0.86, filter: 'blur(6px)' }, { opacity: 1, scale: 1, filter: 'blur(0px)', duration: 0.45, ease: 'power3.out' }, T.boot + 0.05)
      tl.fromTo('[data-boot-line]', { opacity: 0, x: -8 }, { opacity: 1, x: 0, stagger: 0.18, duration: 0.15 }, T.boot + 0.25)
      tl.to('[data-screen-boot]', { opacity: 0, scale: 1.04, duration: 0.2 }, T.boot + 0.85)
      tl.fromTo('[data-screen-home]', { opacity: 0 }, { opacity: 1, duration: 0.2 }, T.boot + 0.9)
      tl.fromTo('[data-screen-widget]', { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.3, ease: 'power3.out' }, T.boot + 0.95)
      tl.fromTo('[data-app]', { opacity: 0, y: 14, scale: 0.8 }, { opacity: 1, y: 0, scale: 1, stagger: 0.05, duration: 0.3, ease: 'back.out(1.6)' }, T.boot + 1.0)
      tl.to('[data-inside]', { opacity: 0, y: -20, duration: 0.3 }, T.mapOpen - 0.35)
      tl.to('[data-app="map"] .app-tile', { scale: 0.86, duration: 0.08, yoyo: true, repeat: 1 }, T.mapOpen - 0.2)

      // ---------- 04 Dolly into the screen → fullscreen map ----------
      tl.to(frame, { scale: fillScale, duration: 1.0, ease: 'expo.inOut' }, T.mapOpen)
      tl.to('[data-hud], [data-ar], .inside-cap', { opacity: 0, duration: 0.3 }, T.mapOpen)
      tl.fromTo(mapstage, { opacity: 0 }, { opacity: 1, duration: 0.35 }, T.mapOpen + 0.05)
      tl.to('[data-screen-home]', { opacity: 0, duration: 0.3 }, T.mapOpen + 0.1)
      tl.to('[data-cockpit]', { autoAlpha: 0, duration: 0.15 }, T.mapOpen + 0.95)
      tl.fromTo('[data-map-ui] .rail, [data-map-ui] .legend', { opacity: 0 }, { opacity: 1, duration: 0.3 }, T.problem - 0.3)

      // ---------- Story panels ----------
      const panel = (id: string, at: number, hold: number) => {
        const sel = `[data-panel="${id}"]`
        tl.fromTo(sel, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.15 }, at)
        tl.fromTo(`${sel} > *`, { y: 60, opacity: 0 }, { y: 0, opacity: 1, stagger: 0.08, duration: 0.4, ease: 'power3.out' }, at)
        tl.to(`${sel} > *`, { y: -40, opacity: 0, stagger: 0.05, duration: 0.3, ease: 'power2.in' }, at + hold)
        tl.set(sel, { autoAlpha: 0 }, at + hold + 0.35)
      }
      panel('problem', T.problem, 1.1)
      panel('how', T.how, 1.0)
      panel('features', T.features, 1.0)
      panel('team', T.team, 0.9)
      tl.to('[data-map-ui] .rail, [data-map-ui] .legend', { opacity: 0, duration: 0.2 }, T.glitch)

      // ---------- 06 Glitch → footer ----------
      tl.call(() => glitch.current?.snapshot(), [], T.glitch - 0.05)
      tl.to(glitchProxy, { g: 1, duration: T.end - T.glitch, onUpdate: () => glitch.current?.set(glitchProxy.g) }, T.glitch)
      tl.to(mapstage, { opacity: 0, duration: 0.3 }, T.glitch + 0.6)
      tl.set({}, {}, T.end)
    },
    { scope },
  )
}
