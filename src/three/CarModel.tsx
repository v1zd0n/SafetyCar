import { useEffect } from 'react'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { CAR_URL } from './modelAvailable'

/** The real GLB car (this module is only loaded when /models/car.glb exists). */
export function Car() {
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
