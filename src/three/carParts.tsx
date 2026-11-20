import { useMemo } from 'react'
import * as THREE from 'three'

/**
 * Samples the sculpted body so trim can sit exactly ON the paint
 * (bevels and the plan-view pinch make hand-typed coordinates drift).
 */
export function makeSurface(geo: THREE.BufferGeometry) {
  const p = geo.attributes.position as THREE.BufferAttribute
  const xs = new Float32Array(p.count)
  const ys = new Float32Array(p.count)
  const zs = new Float32Array(p.count)
  for (let i = 0; i < p.count; i++) {
    xs[i] = p.getX(i)
    ys[i] = p.getY(i)
    zs[i] = p.getZ(i)
  }
  const pick = (test: (i: number) => boolean, val: (i: number) => number, best: (a: number, b: number) => boolean, fallback: number) => {
    let out = NaN
    for (let i = 0; i < p.count; i++) if (test(i) && (Number.isNaN(out) || best(val(i), out))) out = val(i)
    return Number.isNaN(out) ? fallback : out
  }
  // The extrusion only has vertices at its two side walls (+ bevel rings), so
  // there is nothing to sample "at x = 0". The nose/tail profile does not depend
  // on x (sculpt() only scales x), so sample by height and ignore x — except
  // near the rounded side edges, where the surface curls back.
  const halfW = (y: number) => pick((i) => Math.abs(ys[i] - y) < 0.03, (i) => Math.abs(xs[i]), (a, b) => a > b, 0.9)
  const edge = (y: number, x: number) => Math.max(0, Math.abs(x) - (halfW(y) - 0.13)) // inside the side bevel
  return {
    /** z of the nose surface at height y (x only matters inside the side bevel) */
    front: (y: number, x = 0) =>
      pick((i) => Math.abs(ys[i] - y) < 0.03, (i) => zs[i], (a, b) => a < b, -2.4) + edge(y, x) * 1.2,
    /** z of the tail surface at height y */
    rear: (y: number, x = 0) =>
      pick((i) => Math.abs(ys[i] - y) < 0.03, (i) => zs[i], (a, b) => a > b, 2.4) - edge(y, x) * 1.2,
    /** highest point of the body at longitudinal position z */
    top: (z: number) => pick((i) => Math.abs(zs[i] - z) < 0.06, (i) => ys[i], (a, b) => a > b, 0.9),
  }
}

/** EU-style licence plate texture: blue BG band + "PAYNER OS". */
function plateTexture(text: string) {
  const W = 1040
  const H = 220
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')!
  // plate body
  g.fillStyle = '#f4f4f2'
  g.beginPath()
  g.roundRect(4, 4, W - 8, H - 8, 22)
  g.fill()
  g.lineWidth = 8
  g.strokeStyle = '#111'
  g.stroke()
  // EU band
  g.fillStyle = '#0a3d9e'
  g.beginPath()
  g.roundRect(10, 10, 120, H - 20, [16, 0, 0, 16])
  g.fill()
  g.fillStyle = '#ffd400'
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2
    g.beginPath()
    g.arc(70 + Math.cos(a) * 30, 70 + Math.sin(a) * 30, 5, 0, Math.PI * 2)
    g.fill()
  }
  g.fillStyle = '#fff'
  g.font = '700 54px Arial, Helvetica, sans-serif'
  g.textAlign = 'center'
  g.fillText('BG', 70, 178)
  // registration
  g.fillStyle = '#111'
  g.font = '900 150px "Arial Black", Arial, Helvetica, sans-serif'
  g.textBaseline = 'middle'
  g.fillText(text, 140 + (W - 150) / 2, H / 2 + 6, W - 180)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  return tex
}

/** Licence plate with a dark holder; `facing` -1 = front (looks to -Z), 1 = rear. */
export function Plate({ position, facing, text = 'PAYNER OS' }: { position: [number, number, number]; facing: -1 | 1; text?: string }) {
  const tex = useMemo(() => plateTexture(text), [text])
  return (
    <group position={position} rotation={[0, facing === -1 ? Math.PI : 0, 0]}>
      {/* holder sits clearly BEHIND the plate (its front face at z=-0.008) — no z-fighting */}
      <mesh position={[0, 0, -0.03]}>
        <boxGeometry args={[0.56, 0.135, 0.044]} />
        <meshStandardMaterial color="#060607" roughness={0.5} metalness={0.4} />
      </mesh>
      <mesh renderOrder={1}>
        <planeGeometry args={[0.52, 0.11]} />
        <meshStandardMaterial
          map={tex}
          roughness={0.35}
          metalness={0.1}
          emissive="#ffffff"
          emissiveMap={tex}
          emissiveIntensity={0.35}
          polygonOffset
          polygonOffsetFactor={-2}
          polygonOffsetUnits={-2}
        />
      </mesh>
    </group>
  )
}
