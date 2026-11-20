import { Suspense, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { ContactShadows, Environment, Lightformer, MeshReflectorMaterial } from '@react-three/drei'
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing'
import * as THREE from 'three'
import { Car } from './CarModel'
import { rig } from '../scroll/store'

function CameraRig() {
  const { camera, pointer } = useThree()
  const target = useRef(new THREE.Vector3(rig.tx, rig.ty, rig.tz))
  const desired = useRef(new THREE.Vector3())
  const look = useRef(new THREE.Vector3())

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime
    const w = rig.heroWeight
    // idle orbit + mouse parallax, only while on the hero
    const orbit = Math.sin(t * 0.12) * 0.35 * w
    const cos = Math.cos(orbit)
    const sin = Math.sin(orbit)
    const x = rig.px * cos - rig.pz * sin + pointer.x * 0.4 * w
    const z = rig.px * sin + rig.pz * cos
    desired.current.set(x, rig.py + pointer.y * 0.15 * w, z)

    const k = 1 - Math.exp(-dt * 6)
    camera.position.lerp(desired.current, k)
    look.current.set(rig.tx, rig.ty, rig.tz)
    target.current.lerp(look.current, k)
    camera.lookAt(target.current)
  })
  return null
}

function Studio({ lite }: { lite: boolean }) {
  return (
    <>
      <color attach="background" args={['#0a0a0b']} />
      <fog attach="fog" args={['#0a0a0b', 9, 22]} />
      <ambientLight intensity={0.15} />
      <spotLight position={[0, 7, 0]} angle={0.5} penumbra={1} intensity={60} color="#ffffff" castShadow={!lite} />
      <pointLight position={[-6, 1.2, 2]} intensity={25} color="#ff5a1f" distance={14} />
      <pointLight position={[6, 2, -4]} intensity={8} color="#7aa2ff" distance={14} />

      {/* Reflection-only studio environment, no network HDRI needed */}
      <Environment resolution={256} frames={1}>
        <Lightformer form="rect" intensity={4} position={[0, 5, 0]} rotation-x={Math.PI / 2} scale={[10, 0.6, 1]} />
        <Lightformer form="rect" intensity={2} position={[-5, 1.5, 0]} rotation-y={Math.PI / 2} scale={[8, 0.4, 1]} />
        <Lightformer form="rect" intensity={2} position={[5, 1.5, 0]} rotation-y={-Math.PI / 2} scale={[8, 0.4, 1]} />
        <Lightformer form="ring" color="#ff5a1f" intensity={3} position={[-4, 2, -6]} scale={3} />
      </Environment>

      {lite ? (
        <mesh rotation-x={-Math.PI / 2} receiveShadow>
          <planeGeometry args={[60, 60]} />
          <meshStandardMaterial color="#0b0b0c" roughness={0.4} metalness={0.4} />
        </mesh>
      ) : (
        <mesh rotation-x={-Math.PI / 2}>
          <planeGeometry args={[60, 60]} />
          <MeshReflectorMaterial
            blur={[400, 120]}
            resolution={1024}
            mixBlur={1}
            mixStrength={18}
            roughness={0.9}
            depthScale={1}
            minDepthThreshold={0.4}
            maxDepthThreshold={1.4}
            color="#0c0c0d"
            metalness={0.6}
            mirror={0.5}
          />
        </mesh>
      )}
      <ContactShadows position={[0, 0.005, 0]} opacity={0.8} scale={8} blur={2.4} far={2} />
    </>
  )
}

export function Experience({ active, lite }: { active: boolean; lite: boolean }) {
  return (
    <Canvas
      className="scene"
      frameloop={active ? 'always' : 'never'}
      dpr={lite ? [1, 1.25] : [1, 1.75]}
      shadows={!lite}
      gl={{ antialias: !lite, powerPreference: 'high-performance', toneMapping: THREE.ACESFilmicToneMapping }}
      camera={{ fov: lite ? 50 : 35, near: 0.05, far: 60, position: [rig.px, rig.py, rig.pz] }}
    >
      <Suspense fallback={null}>
        <Studio lite={lite} />
        <Car />
        <CameraRig />
        {!lite && (
          <EffectComposer multisampling={0}>
            <Bloom mipmapBlur intensity={0.9} luminanceThreshold={0.85} luminanceSmoothing={0.2} />
            <Vignette offset={0.25} darkness={0.75} />
          </EffectComposer>
        )}
      </Suspense>
    </Canvas>
  )
}
