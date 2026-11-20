import { useEffect } from 'react'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { CAR_URL, useModelAvailable } from './modelAvailable'
import { PlaceholderCar } from './PlaceholderCar'

function GltfCar() {
  const { scene } = useGLTF(CAR_URL)
  useEffect(() => {
    scene.traverse((o) => {
      const m = o as THREE.Mesh
      if (m.isMesh) {
        m.castShadow = true
        m.receiveShadow = true
      }
    })
  }, [scene])
  return <primitive object={scene} />
}

/** Real GLB if /public/models/car.glb exists, otherwise the procedural EV. */
export function Car() {
  const available = useModelAvailable()
  if (available === 'yes') return <GltfCar />
  if (available === 'no') return <PlaceholderCar />
  return null
}
