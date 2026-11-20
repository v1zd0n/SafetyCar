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
  // measured from public/images/cockpit-interior.webp by scripts/cockpit-keys.py
  w: 1672,
  h: 941,
  images: {
    interior: '/images/cockpit-interior.webp', // windshield + screens transparent
    road: '/images/cockpit-road.webp',
    wallpaper: '/images/payner-wallpaper.webp',
  },
  screen: { x: 648, y: 368, w: 384, h: 220, r: 6 },
  cluster: { x: 356, y: 400, w: 236, h: 64, r: 6 },
  /** vanishing point of the road as seen through the windshield (vector fallback only) */
  horizon: { x: 836, y: 300 },
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
