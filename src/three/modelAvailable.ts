import { useEffect, useState } from 'react'

export const CAR_URL = '/models/car.glb'

/**
 * Detects whether a real model has been dropped into /public/models/car.glb.
 * Kept free of three.js imports so the main bundle stays small: the 3D scene
 * is only downloaded when a model actually exists.
 */
export function useModelAvailable(url = CAR_URL) {
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
