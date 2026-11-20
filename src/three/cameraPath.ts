/**
 * Camera keyframes for the exterior part of the scroll story.
 * Car space: front = -Z, centred on the origin, ground at y = 0.
 * The interior is a 2.5D cockpit (src/cockpit), not 3D — the camera
 * only has to reach the side glass, then the cockpit takes over.
 */
type V3 = [number, number, number]
export type Keyframe = { pos: V3; target: V3 }

export const KEYFRAMES = {
  // front three-quarter (front = -Z); target above the car keeps it under the headline
  // target is offset to the camera's left so the car sits right-of-centre, under the copy
  hero: { pos: [5.9, 1.5, -7.0], target: [0.95, 1.5, 0.35] },
  side: { pos: [6.4, 1.2, 1.6], target: [0, 0.8, 0] },
  approach: { pos: [2.0, 1.1, -0.15], target: [0, 1.02, -0.3] },
  /** pushes into the side glass while the "through the glass" flash plays */
  glass: { pos: [0.95, 1.06, -0.25], target: [-1, 1.0, -0.35] },
} satisfies Record<string, Keyframe>
