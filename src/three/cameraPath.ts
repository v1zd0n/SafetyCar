/**
 * Camera keyframes for the exterior part of the scroll story.
 * Car space: front = -Z, centred on the origin, ground at y = 0.
 * The interior is a 2.5D cockpit (src/cockpit), not 3D — the camera
 * only has to reach the side glass, then the cockpit takes over.
 */
type V3 = [number, number, number]
export type Keyframe = { pos: V3; target: V3 }

export const KEYFRAMES = {
  // target sits above the car so it lands in the lower half, under the headline
  hero: { pos: [5.8, 1.5, 7.2], target: [0, 1.45, 0] },
  side: { pos: [5.6, 1.15, -2.4], target: [0, 0.8, 0] },
  approach: { pos: [1.9, 1.1, 0.1], target: [0, 1.02, -0.15] },
  /** pushes into the side glass while the "through the glass" flash plays */
  glass: { pos: [0.95, 1.06, -0.05], target: [-1, 1.0, -0.25] },
} satisfies Record<string, Keyframe>
