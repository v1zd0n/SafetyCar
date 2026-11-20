import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { drive } from './drive'
import { makeSurface, Plate } from './carParts'

/**
 * Procedural, unbranded EV fastback (used until a real GLB is dropped into
 * /public/models/car.glb). Exterior only — the cabin is the 2.5D cockpit.
 * Front of the car = -Z, ground at y = 0. Wheels spin with `drive.speed`
 * so the car "drives" on the scrolling studio lane.
 */
const BODY_W = 1.9
const GLASS_W = 1.46
const ORANGE = '#ff5a1f'

type P = [number, number]

/** Smooth closed side profile: spline through `top`, straight floor. */
function extrudeSmooth(top: P[], floorY: number, width: number, bevel: number) {
  const shape = new THREE.Shape()
  shape.moveTo(top[0][0], floorY)
  shape.lineTo(top[0][0], top[0][1])
  shape.splineThru(top.slice(1).map(([x, y]) => new THREE.Vector2(x, y)))
  shape.lineTo(top[top.length - 1][0], floorY)
  shape.closePath()
  const depth = width - bevel * 2
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 12,
    curveSegments: 72,
  })
  geo.translate(0, 0, -depth / 2)
  geo.rotateY(-Math.PI / 2) // shape X → world Z
  sculpt(geo)
  geo.computeVertexNormals()
  return geo
}

/**
 * Turns the flat-sided extrusion into a car-like volume:
 *  - plan view: nose and tail pinch in (rounded corners seen from above)
 *  - tumblehome: the body narrows towards the roof
 */
function sculpt(geo: THREE.BufferGeometry) {
  const pos = geo.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const z = pos.getZ(i)
    const ends = Math.min(1, Math.abs(z) / 2.42)
    const plan = 1 - 0.2 * Math.pow(ends, 4) // rounded nose/tail
    const tumble = 1 - 0.16 * THREE.MathUtils.clamp((y - 0.62) / 0.75, 0, 1) // narrower towards the roof
    const belly = 1 - 0.05 * THREE.MathUtils.clamp((0.42 - y) / 0.2, 0, 1) // tuck under the sills
    pos.setX(i, x * plan * tumble * belly)
  }
  pos.needsUpdate = true
}

/** A light strip that follows a 3D curve (tube). */
function LightStrip({ points, color, intensity = 5, radius = 0.012 }: { points: [number, number, number][]; color: string; intensity?: number; radius?: number }) {
  const geo = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)))
    return new THREE.TubeGeometry(curve, 64, radius, 8, false)
  }, [points, radius])
  return (
    <mesh geometry={geo}>
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={intensity} toneMapped={false} />
    </mesh>
  )
}

function Wheel({ position }: { position: [number, number, number] }) {
  const side = position[0] > 0 ? 1 : -1
  const spin = useRef<THREE.Group>(null)
  useFrame((_, dt) => {
    // wheel radius 0.36 → angular speed = v / r
    if (spin.current) spin.current.rotation.x -= (drive.speed / 0.36) * dt
  })
  return (
    <group position={position}>
      {/* brake caliper (does not spin) */}
      <mesh position={[side * 0.05, 0.12, -0.12]}>
        <boxGeometry args={[0.06, 0.16, 0.1]} />
        <meshStandardMaterial color={ORANGE} roughness={0.35} metalness={0.3} emissive={ORANGE} emissiveIntensity={0.25} />
      </mesh>
      <group ref={spin}>
        <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.36, 0.36, 0.26, 64]} />
          <meshStandardMaterial color="#0a0a0b" roughness={0.85} />
        </mesh>
        {/* tyre sidewall ring */}
        <mesh position={[side * 0.131, 0, 0]} rotation={[0, side * Math.PI / 2, 0]}>
          <torusGeometry args={[0.315, 0.035, 12, 64]} />
          <meshStandardMaterial color="#121214" roughness={0.9} />
        </mesh>
        {/* aero rim */}
        <mesh position={[side * 0.132, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.27, 0.27, 0.012, 64]} />
          <meshPhysicalMaterial color="#1c1d20" metalness={0.9} roughness={0.22} clearcoat={1} />
        </mesh>
        {Array.from({ length: 5 }, (_, i) => (
          <mesh key={i} position={[side * 0.142, 0, 0]} rotation={[(i / 5) * Math.PI * 2, 0, 0]}>
            <boxGeometry args={[0.012, 0.44, 0.05]} />
            <meshStandardMaterial color="#3a3b40" metalness={1} roughness={0.28} />
          </mesh>
        ))}
        <mesh position={[side * 0.15, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.05, 0.05, 0.01, 32]} />
          <meshStandardMaterial color={ORANGE} emissive={ORANGE} emissiveIntensity={1.2} toneMapped={false} />
        </mesh>
      </group>
    </group>
  )
}

export function PlaceholderCar() {
  const { body, glass, skirt, surf } = useMemo(() => {
    const body = extrudeSmooth(
      [
        [-2.3, 0.34],
        [-2.39, 0.4],
        [-2.42, 0.5],
        [-2.36, 0.59],
        [-2.16, 0.67],
        [-1.85, 0.72],
        [-1.2, 0.79],
        [-0.4, 0.85],
        [0.6, 0.88],
        [1.6, 0.9],
        [2.12, 0.88],
        [2.34, 0.82],
        [2.43, 0.7],
        [2.44, 0.52],
        [2.38, 0.38],
        [2.3, 0.34],
      ],
      0.24,
      BODY_W,
      0.13,
    )
    const glass = extrudeSmooth(
      [
        [-1.15, 0.79],
        [-0.75, 0.97],
        [-0.25, 1.21],
        [0.35, 1.31],
        [0.95, 1.27],
        [1.6, 1.07],
        [2.12, 0.86],
      ],
      0.79,
      GLASS_W,
      0.1,
    )
    const skirt = extrudeSmooth(
      [
        [-1.5, 0.3],
        [0, 0.31],
        [1.5, 0.3],
      ],
      0.2,
      BODY_W - 0.04,
      0.02,
    )
    return { body, glass, skirt, surf: makeSurface(body) }
  }, [])

  const half = BODY_W / 2
  const beamTarget = useMemo(() => new THREE.Object3D(), [])
  return (
    <group>
      {/* Paint — deep graphite with clearcoat */}
      <mesh geometry={body} castShadow receiveShadow>
        <meshPhysicalMaterial color="#202226" metalness={0.78} roughness={0.2} clearcoat={1} clearcoatRoughness={0.03} />
      </mesh>
      <mesh geometry={skirt}>
        <meshStandardMaterial color="#060607" roughness={0.6} />
      </mesh>
      {/* Panoramic glass canopy */}
      <mesh geometry={glass} castShadow>
        <meshPhysicalMaterial color="#030407" metalness={0.45} roughness={0.03} clearcoat={1} clearcoatRoughness={0} />
      </mesh>

      <FrontEnd surf={surf} />
      <RearEnd surf={surf} />

      {/* Orange accent: sill line + window line (DLO) on both sides */}
      {[-1, 1].map((s) => (
        <group key={s}>
          <LightStrip color={ORANGE} intensity={1.6} radius={0.006} points={[[s * 0.925, 0.42, -1.55], [s * 0.957, 0.42, 0], [s * 0.925, 0.42, 1.55]]} />
          <LightStrip
            color={ORANGE}
            intensity={1.2}
            radius={0.004}
            points={[
              [s * 0.69, 0.81, -1.05],
              [s * 0.705, 0.825, 0],
              [s * 0.69, 0.83, 1.2],
              [s * 0.62, 0.84, 1.95],
            ]}
          />
          {/* flush door handles */}
          {[-0.25, 0.75].map((z) => (
            <mesh key={z} position={[s * (half * 0.968), 0.74, z]}>
              <boxGeometry args={[0.02, 0.025, 0.22]} />
              <meshStandardMaterial color="#0d0d0f" metalness={0.8} roughness={0.3} />
            </mesh>
          ))}
          {/* door shut line */}
          <mesh position={[s * (half * 0.995), 0.58, 0.28]}>
            <boxGeometry args={[0.004, 0.5, 0.006]} />
            <meshStandardMaterial color="#050506" />
          </mesh>
          {/* camera-style side mirror */}
          <group position={[s * 0.82, 0.86, -0.85]}>
            <mesh position={[s * 0.06, 0, 0]}>
              <boxGeometry args={[0.14, 0.035, 0.05]} />
              <meshPhysicalMaterial color="#202226" metalness={0.8} roughness={0.2} clearcoat={1} />
            </mesh>
            <mesh position={[s * 0.15, 0, 0]}>
              <boxGeometry args={[0.1, 0.07, 0.12]} />
              <meshPhysicalMaterial color="#202226" metalness={0.8} roughness={0.2} clearcoat={1} />
            </mesh>
          </group>
        </group>
      ))}

      {/* wheel-arch shadows */}
      {[-1.45, 1.5].map((z) => (
        <mesh key={z} position={[0, 0.38, z]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.42, 0.42, BODY_W - 0.1, 48, 1, true]} />
          <meshStandardMaterial color="#020203" side={THREE.BackSide} />
        </mesh>
      ))}
      <Wheel position={[0.86, 0.36, -1.45]} />
      <Wheel position={[-0.86, 0.36, -1.45]} />
      <Wheel position={[0.86, 0.36, 1.5]} />
      <Wheel position={[-0.86, 0.36, 1.5]} />

      {/* Headlights throw light on the floor ahead (target must live in the scene) */}
      <primitive object={beamTarget} position={[0, 0, -7]} />
      <spotLight position={[0, 0.62, surf.front(0.62) - 0.05]} angle={0.55} penumbra={0.9} intensity={18} distance={9} color="#f2f4ff" target={beamTarget} />
    </group>
  )
}

type Surf = ReturnType<typeof makeSurface>
const GLOSS_BLACK = { color: '#050506', metalness: 0.6, roughness: 0.12, clearcoat: 1 }

/** Points that hug the nose/tail at height y across the width. */
function along(surf: Surf, end: 'front' | 'rear', y: number, xs: number[], out = 0.006) {
  return xs.map((x) => {
    const z = surf[end](y, x)
    return [x, y, end === 'front' ? z - out : z + out] as [number, number, number]
  })
}

function FrontEnd({ surf }: { surf: Surf }) {
  const bar = along(surf, 'front', 0.6, [-0.66, -0.45, -0.2, 0, 0.2, 0.45, 0.66])
  const zFace = surf.front(0.48)
  // the nose is raked: stand the plate proud of the most forward point it spans
  const zPlate = Math.min(surf.front(0.29), surf.front(0.36), surf.front(0.42)) - 0.035
  const zLow = surf.front(0.2)
  return (
    <group>
      {/* full-width DRL light bar */}
      <LightStrip color="#ffffff" intensity={4} radius={0.011} points={bar} />
      {/* headlight pods at the corners: short slanted DRL "fangs" */}
      {[-1, 1].map((s) => (
        <LightStrip key={s} color="#ffffff" intensity={5} radius={0.008} points={along(surf, 'front', 0.6, [s * 0.66]).concat(along(surf, 'front', 0.52, [s * 0.6]))} />
      ))}
      {/* gloss-black face panel between the lights */}
      <mesh position={[0, 0.48, zFace + 0.012]}>
        <boxGeometry args={[1.05, 0.1, 0.04]} />
        <meshPhysicalMaterial {...GLOSS_BLACK} />
      </mesh>
      {/* licence plate */}
      <Plate position={[0, 0.355, zPlate]} facing={-1} />
      {/* lower air intake with fins */}
      <mesh position={[0, 0.215, zLow + 0.02]}>
        <boxGeometry args={[1.2, 0.09, 0.06]} />
        <meshStandardMaterial color="#020203" roughness={0.9} />
      </mesh>
      {Array.from({ length: 9 }, (_, i) => (
        <mesh key={i} position={[(i - 4) * 0.13, 0.215, zLow - 0.005]}>
          <boxGeometry args={[0.012, 0.08, 0.02]} />
          <meshStandardMaterial color="#1a1a1d" metalness={0.8} roughness={0.3} />
        </mesh>
      ))}
      {/* splitter with an orange edge */}
      <mesh position={[0, 0.135, zLow + 0.02]}>
        <boxGeometry args={[1.5, 0.018, 0.16]} />
        <meshStandardMaterial color="#0a0a0b" roughness={0.4} metalness={0.5} />
      </mesh>
      <LightStrip
        color={ORANGE}
        intensity={2.2}
        radius={0.005}
        points={[
          [-0.75, 0.135, zLow - 0.055],
          [0, 0.135, zLow - 0.065],
          [0.75, 0.135, zLow - 0.055],
        ]}
      />
    </group>
  )
}

function RearEnd({ surf }: { surf: Surf }) {
  const bar = along(surf, 'rear', 0.72, [-0.7, -0.45, -0.2, 0, 0.2, 0.45, 0.7], 0.008)
  const zPanel = surf.rear(0.62)
  const zPlate = Math.max(surf.rear(0.4), surf.rear(0.46), surf.rear(0.52)) + 0.035
  const zLow = surf.rear(0.24)
  const yDeck = surf.top(2.15)
  return (
    <group>
      {/* full-width tail light + vertical corner blades */}
      <LightStrip color="#ff2a10" intensity={5} radius={0.016} points={bar} />
      {[-1, 1].map((s) => (
        <LightStrip key={s} color="#ff2a10" intensity={4} radius={0.01} points={along(surf, 'rear', 0.72, [s * 0.7], 0.008).concat(along(surf, 'rear', 0.6, [s * 0.66], 0.008))} />
      ))}
      {/* gloss-black tail panel */}
      <mesh position={[0, 0.62, zPanel - 0.012]}>
        <boxGeometry args={[1.1, 0.08, 0.04]} />
        <meshPhysicalMaterial {...GLOSS_BLACK} />
      </mesh>
      {/* ducktail spoiler lip */}
      <mesh position={[0, yDeck + 0.012, 2.2]} rotation={[0.18, 0, 0]}>
        <boxGeometry args={[1.25, 0.018, 0.16]} />
        <meshPhysicalMaterial {...GLOSS_BLACK} />
      </mesh>
      {/* licence plate */}
      <Plate position={[0, 0.46, zPlate]} facing={1} />
      {/* diffuser with fins + reversing lights */}
      <mesh position={[0, 0.22, zLow - 0.02]}>
        <boxGeometry args={[1.3, 0.13, 0.08]} />
        <meshStandardMaterial color="#020203" roughness={0.85} />
      </mesh>
      {Array.from({ length: 6 }, (_, i) => (
        <mesh key={i} position={[(i - 2.5) * 0.2, 0.2, zLow + 0.015]}>
          <boxGeometry args={[0.012, 0.12, 0.1]} />
          <meshStandardMaterial color="#1a1a1d" metalness={0.8} roughness={0.3} />
        </mesh>
      ))}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.6, 0.3, surf.rear(0.3, s * 0.6) + 0.006]}>
          <boxGeometry args={[0.12, 0.02, 0.01]} />
          <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={2.5} toneMapped={false} />
        </mesh>
      ))}
    </group>
  )
}
