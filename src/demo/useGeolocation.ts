import { useCallback, useEffect, useRef, useState } from 'react'

export type UserPosition = { lng: number; lat: number; accuracy: number; heading: number | null }
export type GeoStatus = 'idle' | 'locating' | 'ready' | 'error'

function message(error: GeolocationPositionError | Error) {
  if ('code' in error) {
    if (error.code === error.PERMISSION_DENIED) return 'Достъпът до местоположението е отказан. Разрешете го от настройките на браузъра.'
    if (error.code === error.TIMEOUT) return 'Не успяхме да открием местоположението навреме. Опитайте отново.'
    return 'Местоположението в момента не е налично.'
  }
  return error.message
}

/**
 * Live device position. `locate()` asks for permission on first use, keeps a
 * watch running afterwards and resolves with the first fix.
 */
export function useGeolocation() {
  const [status, setStatus] = useState<GeoStatus>('idle')
  const [position, setPosition] = useState<UserPosition | null>(null)
  const [error, setError] = useState('')
  const watch = useRef<number | null>(null)
  const latest = useRef<UserPosition | null>(null)

  const locate = useCallback((): Promise<UserPosition> => {
    if (!('geolocation' in navigator)) {
      const text = 'Браузърът не поддържа определяне на местоположение.'
      setStatus('error')
      setError(text)
      return Promise.reject(new Error(text))
    }
    if (latest.current && watch.current !== null) return Promise.resolve(latest.current)
    setStatus('locating')
    setError('')
    return new Promise((resolve, reject) => {
      let settled = false
      const onFix = (p: GeolocationPosition) => {
        const next = {
          lng: p.coords.longitude,
          lat: p.coords.latitude,
          accuracy: p.coords.accuracy,
          heading: Number.isFinite(p.coords.heading ?? NaN) ? p.coords.heading : null,
        }
        latest.current = next
        setPosition(next)
        setStatus('ready')
        if (!settled) {
          settled = true
          resolve(next)
        }
      }
      const onError = (e: GeolocationPositionError) => {
        if (watch.current !== null) navigator.geolocation.clearWatch(watch.current)
        watch.current = null
        setStatus(latest.current ? 'ready' : 'error')
        setError(message(e))
        if (!settled) {
          settled = true
          reject(new Error(message(e)))
        }
      }
      if (watch.current !== null) navigator.geolocation.clearWatch(watch.current)
      watch.current = navigator.geolocation.watchPosition(onFix, onError, { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 })
    })
  }, [])

  useEffect(
    () => () => {
      if (watch.current !== null) navigator.geolocation.clearWatch(watch.current)
    },
    [],
  )

  return { status, position, error, locate, clearError: () => setError('') }
}
