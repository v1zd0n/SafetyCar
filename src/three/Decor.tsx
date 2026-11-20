import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Grid, Sparkles } from '@react-three/drei'
import * as THREE from 'three'
import { drive } from './drive'

const ORANGE = '#ff5a1f'

/** Glowing lane markings that scroll under the car → the car "drives" in the studio. */
function Lane() {
  const group = useRef<THREE.Group>(null)
  const DASH = 1.6
  const GAP = 1.4
  const STEP = DASH + GAP
  const COUNT = 12
  useFrame((_, dt) => {
    const g = group.current
    if (!g) return
    g.position.z = (g.position.z + drive.speed * dt) % STEP
  })
  return (
    <group>
      <group ref={group}>
        {Array.from({ length: COUNT }, (_, i) => (
          <mesh key={i} rotation-x={-Math.PI / 2} position={[0, 0.004, -18 + i * STEP]}>
            <planeGeometry args={[0.1, DASH]} />
            <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.6} transparent opacity={0.55} />
          </mesh>
        ))}
      </group>
      {/* solid edge lines in signal orange */}
      {[-1.6, 1.6].map((x) => (
        <mesh key={x} rotation-x={-Math.PI / 2} position={[x, 0.003, -4]}>
          <planeGeometry args={[0.05, 30]} />
          <meshStandardMaterial color={ORANGE} emissive={ORANGE} emissiveIntensity={1.4} transparent opacity={0.7} toneMapped={false} />
        </mesh>
      ))}
    </group>
  )
}

/** Turntable plate with an emissive rim and a rotating tick ring. */
function Turntable() {
  const ticks = useRef<THREE.InstancedMesh>(null)
  const N = 120
  const placed = useRef(false) // instance matrices are written on the first frame
  useFrame((_, dt) => {
    const m = ticks.current
    if (!m) return
    if (!placed.current) {
      const o = new THREE.Object3D()
      for (let i = 0; i < N; i++) {
        const a = (i / N) * Math.PI * 2
        o.position.set(Math.cos(a) * 3.55, 0.012, Math.sin(a) * 3.55)
        o.rotation.set(-Math.PI / 2, 0, -a)
        o.scale.set(1, i % 10 === 0 ? 3 : 1, 1)
        o.updateMatrix()
        m.setMatrixAt(i, o.matrix)
      }
      m.instanceMatrix.needsUpdate = true
      placed.current = true
    }
    m.rotation.y += dt * 0.05
  })
  return (
    <group>
      <mesh position={[0, 0.006, 0]} receiveShadow>
        <cylinderGeometry args={[3.3, 3.3, 0.012, 96]} />
        <meshStandardMaterial color="#0c0c0e" metalness={0.8} roughness={0.35} transparent opacity={0.85} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.014, 0]}>
        <ringGeometry args={[3.28, 3.32, 128]} />
        <meshStandardMaterial color={ORANGE} emissive={ORANGE} emissiveIntensity={2.4} toneMapped={false} />
      </mesh>
      <instancedMesh ref={ticks} args={[undefined, undefined, N]}>
        <planeGeometry args={[0.012, 0.08]} />
        <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.8} transparent opacity={0.5} />
      </instancedMesh>
    </group>
  )
}

/** Half-ring light portals forming a tunnel around the car. */
function Portals() {
  // behind the car as seen from the hero camera (camera sits at -Z, looking toward +Z)
  const zs = [3.8, 6.8, 9.8, 12.8]
  return (
    <group>
      {zs.map((z, i) => (
        <mesh key={z} position={[0, 0, z]}>
          <torusGeometry args={[4.6, 0.025, 8, 96, Math.PI]} />
          <meshStandardMaterial
            color={i === 0 ? ORANGE : '#ffffff'}
            emissive={i === 0 ? ORANGE : '#ffffff'}
            emissiveIntensity={i === 0 ? 2.2 : 0.55 - i * 0.08}
            toneMapped={false}
            transparent
            opacity={0.8}
          />
        </mesh>
      ))}
    </group>
  )
}

/** Speed streaks rushing past at the sides (like long-exposure light trails). */
function Streaks({ count = 10 }: { count?: number }) {
  const refs = useRef<THREE.Mesh[]>([])
  const seeds = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        // low and wide of the car so they never cut through the headline
        x: (i % 2 ? 1 : -1) * (4.2 + Math.random() * 4),
        y: 0.08 + Math.random() * 0.9,
        z: -20 + Math.random() * 40,
        len: 1 + Math.random() * 2.5,
        speed: 14 + Math.random() * 18,
        orange: Math.random() < 0.35,
      })),
    [count],
  )
  useFrame((_, dt) => {
    refs.current.forEach((m, i) => {
      if (!m) return
      const s = seeds[i]
      s.z += s.speed * dt
      if (s.z > 20) s.z = -22
      m.position.z = s.z
    })
  })
  return (
    <group>
      {seeds.map((s, i) => (
        <mesh key={i} ref={(m) => void (m && (refs.current[i] = m))} position={[s.x, s.y, s.z]}>
          <boxGeometry args={[0.012, 0.012, s.len]} />
          <meshStandardMaterial
            color={s.orange ? ORANGE : '#ffffff'}
            emissive={s.orange ? ORANGE : '#ffffff'}
            emissiveIntensity={s.orange ? 2.4 : 0.9}
            toneMapped={false}
            transparent
            opacity={0.6}
          />
        </mesh>
      ))}
    </group>
  )
}

/** Tall LED columns far behind the car. */
function LedWall() {
  return (
    <group position={[0, 0, 17]}>
      {Array.from({ length: 13 }, (_, i) => {
        const x = (i - 6) * 1.6
        const h = 3 + Math.abs(Math.sin(i * 1.7)) * 4
        return (
          <mesh key={i} position={[x, h / 2, 0]}>
            <planeGeometry args={[0.06, h]} />
            <meshStandardMaterial
              color={i === 6 ? ORANGE : '#ffffff'}
              emissive={i === 6 ? ORANGE : '#ffffff'}
              emissiveIntensity={i === 6 ? 2 : 0.35}
              toneMapped={false}
              transparent
              opacity={0.7}
            />
          </mesh>
        )
      })}
    </group>
  )
}

export function Decor({ lite }: { lite: boolean }) {
  return (
    <group>
      <Lane />
      <Turntable />
      <Portals />
      <LedWall />
      <Grid
        position={[0, 0.002, 0]}
        args={[60, 60]}
        cellSize={0.5}
        cellThickness={0.4}
        cellColor="#2a2a2f"
        sectionSize={3}
        sectionThickness={0.8}
        sectionColor="#5a2a14"
        fadeDistance={22}
        fadeStrength={1.6}
        infiniteGrid
      />
      {!lite && <Streaks />}
      <Sparkles count={lite ? 40 : 120} scale={[14, 4, 14]} position={[0, 2, 0]} size={2.2} speed={0.35} opacity={0.5} color="#ffb98f" />
    </group>
  )
}
