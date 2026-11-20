import type { SVGProps } from 'react'

export const Arrow = (p: SVGProps<SVGSVGElement>) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden {...p}>
    <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

export const Mark = (p: SVGProps<SVGSVGElement>) => (
  <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden {...p}>
    <path className="mark-shield" d="M14 2 3 7v6.5C3 20 7.8 24.6 14 26c6.2-1.4 11-6 11-12.5V7L14 2Z" stroke="currentColor" strokeWidth="2" />
    <path className="mark-lane" d="M14 8v4M14 15v4" stroke="var(--accent-signal)" strokeWidth="2.4" strokeLinecap="round" />
  </svg>
)

const S = '#F4F4F5'
const A = 'var(--accent-signal)'

export const AppGlyphs = {
  map: (
    <>
      <path d="M9 4 3 6.5v13L9 17l6 2.5 6-2.5v-13L15 6.5 9 4Z" stroke={S} strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M9 4v13M15 6.5v13" stroke={S} strokeWidth="1.8" />
      <circle cx="15" cy="10" r="2.2" fill={A} />
    </>
  ),
  stats: (
    <>
      <path d="M4 20V13M10 20V9M16 20V5" stroke={S} strokeWidth="2.2" strokeLinecap="round" />
      <path d="M19.5 14.5 22 19h-5l2.5-4.5Z" fill={A} />
    </>
  ),
  pipeline: (
    <>
      <circle cx="5" cy="12" r="2.6" stroke={S} strokeWidth="1.8" />
      <circle cx="12" cy="6" r="2.6" stroke={S} strokeWidth="1.8" />
      <circle cx="19" cy="14" r="2.6" fill={A} />
      <path d="M7.2 10.6 9.9 7.6M14.3 7.4l2.9 4.6" stroke={S} strokeWidth="1.8" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3 4.5 6v5.5c0 4.6 3.2 8 7.5 9.5 4.3-1.5 7.5-4.9 7.5-9.5V6L12 3Z" stroke={S} strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M12 8v9" stroke={A} strokeWidth="2" strokeDasharray="2 2" />
    </>
  ),
  team: (
    <>
      <circle cx="12" cy="8" r="3" stroke={S} strokeWidth="1.8" />
      <circle cx="5.5" cy="10" r="2.2" stroke={S} strokeWidth="1.6" />
      <circle cx="18.5" cy="10" r="2.2" fill={A} />
      <path d="M6.5 19c.6-3 2.8-4.8 5.5-4.8s4.9 1.8 5.5 4.8" stroke={S} strokeWidth="1.8" strokeLinecap="round" />
    </>
  ),
  route: (
    <>
      <circle cx="5" cy="18" r="2.4" stroke={S} strokeWidth="1.8" />
      <circle cx="19" cy="6" r="2.4" fill={A} />
      <path d="M7 16.5c3-1 2-5 5-6s4-1.5 5.2-2.8" stroke={S} strokeWidth="1.8" strokeLinecap="round" strokeDasharray="3 2.5" />
    </>
  ),
}

export type GlyphKey = keyof typeof AppGlyphs
