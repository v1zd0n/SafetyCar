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
  // exact magenta bounds (full-resolution flood fill)
  screen: { x: 648, y: 366, w: 383, h: 222, r: 5 },
  cluster: { x: 353, y: 398, w: 239, h: 65, r: 5 },
  /** vanishing point of the road as seen through the windshield (vector fallback only) */
  horizon: { x: 836, y: 300 },
  /**
   * The road photo is drawn 108% wide and shifted up by ROAD_SHIFT of the
   * frame height so its horizon sits inside the windshield. roadToFrame maps
   * a pixel of cockpit-road.webp (1672×941) into cockpit/frame coordinates.
   */
  roadShift: 0.334,
}

export function roadToFrame(u: number, v: number): [number, number] {
  return [u * 1.08 - 0.04 * COCKPIT.w, v * 1.08 - COCKPIT.roadShift * COCKPIT.h]
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
