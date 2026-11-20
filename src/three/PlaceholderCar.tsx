import { useMemo } from 'react'
import * as THREE from 'three'

/**
 * Procedural, unbranded EV fastback used until a real GLB is dropped into
 * /public/models/car.glb. Exterior only — the cabin is the 2.5D cockpit.
 * Front of the car = -Z, ground at y = 0.
 */
const BODY_W = 1.9
const GLASS_W = 1.46

type P = [number, number]

/** Smooth closed profile: spline through `top`, straight line along the floor. */
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
    bevelSegments: 10,
    curveSegments: 64,
  })
  geo.translate(0, 0, -depth / 2)
  geo.rotateY(-Math.PI / 2) // shape X → world Z
  geo.computeVertexNormals()
  return geo
}

function Wheel({ position }: { position: [number, number, number] }) {
  const side = position[0] > 0 ? 1 : -1
  return (
    <group position={position}>
      <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.36, 0.36, 0.26, 64]} />
        <meshStandardMaterial color="#0a0a0b" roughness={0.85} />
      </mesh>
      {/* aero rim */}
      <mesh position={[side * 0.132, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.27, 0.27, 0.012, 64]} />
        <meshPhysicalMaterial color="#1c1d20" metalness={0.9} roughness={0.25} clearcoat={1} />
      </mesh>
      {Array.from({ length: 5 }, (_, i) => (
        <mesh key={i} position={[side * 0.14, 0, 0]} rotation={[(i / 5) * Math.PI * 2, 0, 0]}>
          <boxGeometry args={[0.01, 0.42, 0.035]} />
          <meshStandardMaterial color="#3a3b40" metalness={1} roughness={0.3} />
        </mesh>
      ))}
      <mesh position={[side * 0.145, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.05, 0.05, 0.01, 32]} />
        <meshStandardMaterial color="#ff5a1f" emissive="#ff5a1f" emissiveIntensity={0.6} />
      </mesh>
    </group>
  )
}

export function PlaceholderCar() {
  const { body, glass, skirt } = useMemo(() => {
    const body = extrudeSmooth(
      [
        [-2.34, 0.34],
        [-2.38, 0.5],
        [-2.26, 0.64],
        [-1.9, 0.72],
        [-1.2, 0.8],
        [-0.4, 0.86],
        [0.6, 0.89],
        [1.6, 0.9],
        [2.18, 0.86],
        [2.38, 0.74],
        [2.4, 0.5],
        [2.34, 0.34],
      ],
      0.24,
      BODY_W,
      0.12,
    )
    const glass = extrudeSmooth(
      [
        [-1.15, 0.8],
        [-0.75, 0.98],
        [-0.25, 1.22],
        [0.35, 1.32],
        [0.95, 1.28],
        [1.6, 1.08],
        [2.12, 0.86],
      ],
      0.8,
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
    return { body, glass, skirt }
  }, [])

  return (
    <group>
      {/* Paint — deep graphite with clearcoat */}
      <mesh geometry={body} castShadow receiveShadow>
        <meshPhysicalMaterial color="#202226" metalness={0.75} roughness={0.22} clearcoat={1} clearcoatRoughness={0.04} />
      </mesh>
      <mesh geometry={skirt}>
        <meshStandardMaterial color="#060607" roughness={0.6} />
      </mesh>
      {/* Panoramic glass canopy */}
      <mesh geometry={glass} castShadow>
        <meshPhysicalMaterial color="#030407" metalness={0.4} roughness={0.04} clearcoat={1} clearcoatRoughness={0} />
      </mesh>
      {/* orange accent line along the sill */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (BODY_W / 2 + 0.005), 0.42, 0]}>
          <boxGeometry args={[0.01, 0.012, 2.6]} />
          <meshStandardMaterial color="#ff5a1f" emissive="#ff5a1f" emissiveIntensity={1.4} toneMapped={false} />
        </mesh>
      ))}
      {/* Light bars */}
      <mesh position={[0, 0.66, -2.36]}>
        <boxGeometry args={[1.62, 0.018, 0.04]} />
        <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={4} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0.76, 2.4]}>
        <boxGeometry args={[1.7, 0.026, 0.03]} />
        <meshStandardMaterial color="#ff3a10" emissive="#ff3a10" emissiveIntensity={4} toneMapped={false} />
      </mesh>
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
    </group>
  )
}
