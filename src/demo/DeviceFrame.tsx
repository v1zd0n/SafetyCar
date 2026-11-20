import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
// Imported (not served from /public) so every version gets a content-hashed URL: the old frame
// files sat behind a year-long `immutable` cache and kept showing with the new screen insets.
import frameDesktop from '../assets/ui/carplay-frame-desktop.webp'
import frameMobile from '../assets/ui/carplay-frame-mobile.webp'

/**
 * CarPlay-style display: the supplied bezel artwork sits on top and the whole
 * app is laid out inside its transparent screen opening. Openings are measured
 * from src/assets/ui/carplay-frame-*.webp (cropped exactly to the bezel by
 * scripts/prepare-carplay-assets.py) and given in % of the frame.
 */
const FRAMES = {
  desktop: {
    src: frameDesktop,
    aspect: 1500 / 943,
    inset: { left: 4.467, top: 7.635, right: 4.533, bottom: 8.59 },
    radius: '0.5% / 0.8%',
  },
  mobile: {
    src: frameMobile,
    aspect: 750 / 1489,
    inset: { left: 5.2, top: 6.179, right: 5.2, bottom: 6.582 },
    radius: '3% / 1.6%',
  },
} as const

const PORTRAIT = '(max-aspect-ratio: 4/5)'

function usePortrait() {
  const [portrait, setPortrait] = useState(() => window.matchMedia(PORTRAIT).matches)
  useEffect(() => {
    const mq = window.matchMedia(PORTRAIT)
    const on = () => setPortrait(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return portrait
}

/** `enabled=false` (plain /demo): the same screen container, full window, no bezel. */
export function DeviceFrame({ children, enabled = true }: { children: ReactNode; enabled?: boolean }) {
  const portrait = usePortrait()
  if (!enabled) return <div className="mapdash-screen mapdash-screen--full">{children}</div>
  const frame = portrait ? FRAMES.mobile : FRAMES.desktop
  const screen: CSSProperties = {
    left: `${frame.inset.left}%`,
    top: `${frame.inset.top}%`,
    right: `${frame.inset.right}%`,
    bottom: `${frame.inset.bottom}%`,
    borderRadius: frame.radius,
  }
  return (
    <div className={`mapdash-device mapdash-device--${frame === FRAMES.mobile ? 'mobile' : 'desktop'}`} style={{ ['--fa' as string]: frame.aspect }}>
      <div className="mapdash-screen" style={screen}>
        {children}
      </div>
      <img
        className="mapdash-frame"
        src={frame.src}
        alt=""
        draggable={false}
        onLoad={(event) => {
          // the insets above only fit a frame cropped exactly to the bezel
          const img = event.currentTarget
          if (import.meta.env.DEV && Math.abs(img.naturalWidth / img.naturalHeight - frame.aspect) > 0.01)
            console.warn('CarPlay frame aspect changed — re-measure the screen insets in DeviceFrame.tsx', img.naturalWidth, img.naturalHeight)
        }}
      />
    </div>
  )
}
