import { useEffect, useState } from 'react'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { PlaceholderCar } from './PlaceholderCar'

export const CAR_URL = '/models/car.glb'

/** Detects whether a real model has been dropped into /public/models/car.glb. */
function useModelAvailable(url: string) {
  const [state, setState] = useState<'checking' | 'yes' | 'no'>('checking')
  useEffect(() => {
    let alive = true
    fetch(url, { method: 'HEAD' })
      .then((r) => {
        const type = r.headers.get('content-type') ?? ''
        if (alive) setState(r.ok && !type.includes('text/html') ? 'yes' : 'no')
      })
      .catch(() => alive && setState('no'))
    return () => {
      alive = false
    }
  }, [url])
  return state
}

function GltfCar({ url }: { url: string }) {
  const { scene } = useGLTF(url)
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

export function Car() {
  const available = useModelAvailable(CAR_URL)
  if (available === 'yes') return <GltfCar url={CAR_URL} />
  if (available === 'no') return <PlaceholderCar />
  return null
}
