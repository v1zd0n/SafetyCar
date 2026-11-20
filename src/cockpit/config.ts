/**
 * The cockpit is a 2.5D stack of layers drawn in one coordinate space:
 * the generated interior image (1536×1024). Every hotspot below is in
 * those pixels, so the DOM screen always sits exactly on the screen in
 * the picture — whatever the viewport size.
 *
 * When the real images arrive, re-measure `screen` and `cluster` from the
 * magenta areas of the interior image (scripts/cockpit-keys.py does it).
 */
export const COCKPIT = {
  w: 1536,
  h: 1024,
  images: {
    interior: '/images/cockpit-interior.webp', // windshield + screens transparent
    road: '/images/cockpit-road.webp',
    wallpaper: '/images/payner-wallpaper.webp',
  },
  screen: { x: 584, y: 470, w: 368, h: 226, r: 18 },
  cluster: { x: 292, y: 474, w: 226, h: 74, r: 12 },
  /** vanishing point of the road seen through the windshield */
  horizon: { x: 768, y: 330 },
}

export const pct = (v: number, of: number) => `${(v / of) * 100}%`

export function rectStyle(r: { x: number; y: number; w: number; h: number }) {
  return {
    left: pct(r.x, COCKPIT.w),
    top: pct(r.y, COCKPIT.h),
    width: pct(r.w, COCKPIT.w),
    height: pct(r.h, COCKPIT.h),
  }
}

/** transform-origin for the dolly-zoom into the screen */
export const screenOrigin = `${((COCKPIT.screen.x + COCKPIT.screen.w / 2) / COCKPIT.w) * 100}% ${((COCKPIT.screen.y + COCKPIT.screen.h / 2) / COCKPIT.h) * 100}%`
