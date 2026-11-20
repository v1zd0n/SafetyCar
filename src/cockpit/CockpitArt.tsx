import { useState } from 'react'
import { COCKPIT } from './config'

const { w: W, h: H, screen: S, cluster: C, horizon: HZ } = COCKPIT

/** Loads an image; reports failure so a vector fallback can take over. */
export function useImage(src: string) {
  const [state, setState] = useState<'loading' | 'ok' | 'missing'>('loading')
  return {
    state,
    props: {
      src,
      onLoad: () => setState('ok'),
      onError: () => setState('missing'),
      style: { display: state === 'ok' ? undefined : 'none' },
    },
  }
}

/** Night road behind the windshield (vector fallback for cockpit-road.webp). */
export function RoadArt() {
  return (
    <svg className="cockpit__svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#05070d" />
          <stop offset=".55" stopColor="#0d1220" />
          <stop offset=".8" stopColor="#2a1408" />
          <stop offset="1" stopColor="#0a0a0b" />
        </linearGradient>
        <radialGradient id="glow" cx=".5" cy=".32" r=".4">
          <stop offset="0" stopColor="#ff5a1f" stopOpacity=".35" />
          <stop offset="1" stopColor="#ff5a1f" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width={W} height={H} fill="url(#sky)" />
      <rect width={W} height={H} fill="url(#glow)" />
      <path d={`M0 ${HZ.y + 30} L180 270 L330 305 L470 250 L640 300 L760 280 L900 240 L1060 296 L1220 255 L1380 290 L${W} 260 V${H} H0Z`} fill="#07080b" />
      <path d={`M0 ${HZ.y + 60} L260 330 L520 352 L${HZ.x} ${HZ.y + 6} L1040 352 L1300 330 L${W} ${HZ.y + 70} V${H} H0Z`} fill="#0a0b0e" />
      {/* road */}
      <path d={`M${HZ.x - 6} ${HZ.y} L${HZ.x + 6} ${HZ.y} L1260 ${H} L276 ${H}Z`} fill="#111216" />
      <path d={`M${HZ.x - 6} ${HZ.y} L276 ${H}`} stroke="#F4F4F5" strokeOpacity=".35" strokeWidth="3" />
      <path d={`M${HZ.x + 6} ${HZ.y} L1260 ${H}`} stroke="#F4F4F5" strokeOpacity=".35" strokeWidth="3" />
      <path className="road-dash" d={`M${HZ.x} ${HZ.y} L${HZ.x} ${H}`} stroke="#F4F4F5" strokeOpacity=".7" strokeWidth="6" strokeDasharray="26 40" />
      <circle cx={HZ.x - 4} cy={HZ.y + 4} r="2.4" fill="#e5212e" />
      <circle cx={HZ.x + 6} cy={HZ.y + 4} r="2.4" fill="#e5212e" />
    </svg>
  )
}

/** Premium EV interior in vector form (fallback for cockpit-interior.webp). */
export function InteriorArt() {
  const wx = 405
  const wy = 700
  return (
    <svg className="cockpit__svg" viewBox={`0 0 ${W} ${H}`} aria-hidden>
      <defs>
        <linearGradient id="dash" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#17171a" />
          <stop offset=".25" stopColor="#0e0e10" />
          <stop offset="1" stopColor="#050506" />
        </linearGradient>
        <linearGradient id="pillar" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#050506" />
          <stop offset="1" stopColor="#111113" />
        </linearGradient>
        <linearGradient id="console" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#141416" />
          <stop offset="1" stopColor="#070708" />
        </linearGradient>
        <radialGradient id="vig" cx=".5" cy=".45" r=".75">
          <stop offset=".55" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity=".75" />
        </radialGradient>
        <filter id="soft" x="-20%" y="-200%" width="140%" height="500%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
      </defs>

      {/* headliner + pillars */}
      <path d={`M0 0 H${W} V70 C1100 40 436 40 0 70Z`} fill="#070708" />
      <path d="M0 40 C120 40 210 60 250 90 L120 600 L0 640Z" fill="url(#pillar)" />
      <path d={`M${W} 40 C${W - 120} 40 ${W - 210} 60 ${W - 250} 90 L${W - 120} 600 L${W} 640Z`} fill="url(#pillar)" />
      {/* rear-view mirror */}
      <rect x={HZ.x - 90} y="64" width="180" height="46" rx="14" fill="#0b0b0d" stroke="#ffffff" strokeOpacity=".06" />
      <rect x={HZ.x - 6} y="40" width="12" height="28" fill="#0b0b0d" />

      {/* dashboard */}
      <path d={`M0 560 C260 448 560 424 ${HZ.x} 424 C976 424 1276 448 ${W} 560 V${H} H0Z`} fill="url(#dash)" />
      <path d={`M0 560 C260 448 560 424 ${HZ.x} 424 C976 424 1276 448 ${W} 560`} fill="none" stroke="#ffffff" strokeOpacity=".09" strokeWidth="2" />
      {/* vents */}
      {[0, 1, 2].map((i) => (
        <g key={i} stroke="#ffffff" strokeOpacity=".06" strokeWidth="2">
          <path d={`M${120 + i * 6} ${560 - i * 10 + 40} C300 ${505 + i * 6} 470 ${494 + i * 6} 560 ${492 + i * 6}`} fill="none" />
          <path d={`M${W - 120 - i * 6} ${560 - i * 10 + 40} C${W - 300} ${505 + i * 6} ${W - 470} ${494 + i * 6} ${W - 560} ${492 + i * 6}`} fill="none" />
        </g>
      ))}
      {/* ambient light line (drawn on ignition) */}
      <path
        className="ambient"
        d={`M40 600 C300 488 560 462 ${HZ.x} 462 C976 462 1236 488 ${W - 40} 600`}
        fill="none"
        stroke="#ff5a1f"
        strokeWidth="3"
        pathLength={1}
      />
      <path
        className="ambient ambient--glow"
        d={`M40 600 C300 488 560 462 ${HZ.x} 462 C976 462 1236 488 ${W - 40} 600`}
        fill="none"
        stroke="#ff5a1f"
        strokeWidth="14"
        filter="url(#soft)"
        pathLength={1}
      />

      {/* centre console */}
      <path d={`M${S.x + 40} ${S.y + S.h + 20} H${S.x + S.w - 40} L${S.x + S.w + 70} ${H} H${S.x - 70}Z`} fill="url(#console)" />
      <rect x={HZ.x - 60} y={S.y + S.h + 70} width="120" height="10" rx="5" fill="#ff5a1f" opacity=".5" />
      <rect x={HZ.x - 90} y={S.y + S.h + 110} width="180" height="120" rx="20" fill="#0b0b0d" stroke="#ffffff" strokeOpacity=".05" />

      {/* screen + cluster bezels (the DOM sits on top, exactly inside) */}
      <rect x={S.x - 10} y={S.y - 10} width={S.w + 20} height={S.h + 20} rx={S.r + 8} fill="#030304" stroke="#ffffff" strokeOpacity=".1" />
      <rect x={S.x} y={S.y} width={S.w} height={S.h} rx={S.r} fill="#000" />
      <rect x={C.x - 8} y={C.y - 8} width={C.w + 16} height={C.h + 16} rx={C.r + 6} fill="#030304" stroke="#ffffff" strokeOpacity=".08" />
      <rect x={C.x} y={C.y} width={C.w} height={C.h} rx={C.r} fill="#000" />

      {/* steering yoke */}
      <g>
        <path
          d={`M${wx - 190} ${wy - 70} Q${wx - 190} ${wy - 120} ${wx - 140} ${wy - 120} L${wx + 140} ${wy - 120} Q${wx + 190} ${wy - 120} ${wx + 190} ${wy - 70} L${wx + 190} ${wy + 60} Q${wx + 190} ${wy + 170} ${wx} ${wy + 170} Q${wx - 190} ${wy + 170} ${wx - 190} ${wy + 60}Z`}
          fill="none"
          stroke="#121214"
          strokeWidth="40"
          strokeLinejoin="round"
        />
        <path
          d={`M${wx - 190} ${wy - 70} Q${wx - 190} ${wy - 120} ${wx - 140} ${wy - 120} L${wx + 140} ${wy - 120} Q${wx + 190} ${wy - 120} ${wx + 190} ${wy - 70}`}
          fill="none"
          stroke="#ffffff"
          strokeOpacity=".08"
          strokeWidth="2"
          transform="translate(0,-18)"
        />
        <path d={`M${wx - 170} ${wy + 10} H${wx + 170}`} stroke="#101012" strokeWidth="34" />
        <ellipse cx={wx} cy={wy + 20} rx="78" ry="60" fill="#0d0d0f" stroke="#ffffff" strokeOpacity=".06" />
        <circle cx={wx} cy={wy + 20} r="10" fill="#ff5a1f" opacity=".6" />
      </g>

      {/* seats */}
      <path d={`M0 ${H} V860 C80 820 160 840 190 ${H}Z`} fill="#060607" />
      <path d={`M${W} ${H} V860 C${W - 80} 820 ${W - 160} 840 ${W - 190} ${H}Z`} fill="#060607" />

      <rect width={W} height={H} fill="url(#vig)" />
    </svg>
  )
}

/** AR heads-up projection on the windshield. */
export function HudArt({ labels }: { labels: { k: string; dist: string; meta: string; limit: string } }) {
  // placed on the road in cockpit-road.webp (shifted up by the .cockpit__road offset)
  const chevrons = [
    { x: 842, y: 372, s: 0.5 },
    { x: 858, y: 340, s: 0.4 },
    { x: 878, y: 316, s: 0.31 },
    { x: 912, y: 300, s: 0.24 },
  ]
  return (
    <svg className="cockpit__svg hud" viewBox={`0 0 ${W} ${H}`} aria-hidden>
      <defs>
        <filter id="hudglow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <g filter="url(#hudglow)">
        {/* projected risk lane */}
        <path className="hud-lane" d="M830 400 C845 350 862 318 900 302 S980 292 1030 296" stroke="#ff5a1f" strokeWidth="8" strokeLinecap="round" fill="none" opacity=".55" />
        {chevrons.map((c, i) => (
          <path
            key={i}
            className="hud-chevron"
            style={{ animationDelay: `${i * 0.18}s` }}
            transform={`translate(${c.x} ${c.y}) scale(${c.s})`}
            d="M-40 18 L0 -14 L40 18"
            stroke="#ff5a1f"
            strokeWidth="12"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        ))}
        {/* warning readout */}
        {/* outer <g> holds the position; GSAP animates the inner one (it rewrites `transform`) */}
        <g transform="translate(940 132) scale(0.82)">
        <g className="hud-card">
          <text className="hud-mono" x="0" y="0" fill="#ff5a1f">{labels.k.toUpperCase()}</text>
          <text className="hud-big" x="0" y="62" fill="#F4F4F5">{labels.dist}</text>
          <text className="hud-mono" x="0" y="96" fill="#F4F4F5" opacity=".7">{labels.meta}</text>
          <g transform="translate(320 44)">
            <circle r="34" fill="none" stroke="#e5212e" strokeWidth="7" />
            <text className="hud-limit" x="0" y="11" textAnchor="middle" fill="#F4F4F5">50</text>
          </g>
          <text className="hud-mono" x="0" y="128" fill="#ff5a1f" opacity=".9">{labels.limit}</text>
        </g>
        </g>
      </g>
    </svg>
  )
}
