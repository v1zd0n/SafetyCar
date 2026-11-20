import { useEffect, useRef } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { hotspots, VIEWS } from '../data/hotspots'
import { mapCanvas, sectionBus } from '../scroll/store'

const TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined

const mapRef: { current: mapboxgl.Map | null } = { current: null }
mapCanvas.get = () => mapRef.current?.getCanvas() ?? null

/** Mapbox satellite map with 3D terrain and the (mock) risk heatmap. Default export → lazy-loaded chunk. */
export default function MapView({ enabled, lite }: { enabled: boolean; lite: boolean }) {
  const el = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!enabled || !el.current || mapRef.current) return
    if (!TOKEN) {
      console.warn('VITE_MAPBOX_TOKEN is missing — the map is disabled.')
      return
    }
    mapboxgl.accessToken = TOKEN
    const v = VIEWS.intro
    const map = new mapboxgl.Map({
      container: el.current,
      style: 'mapbox://styles/mapbox/satellite-streets-v12',
      center: v.center,
      zoom: v.zoom,
      pitch: v.pitch,
      bearing: v.bearing,
      interactive: false,
      attributionControl: false,
      antialias: !lite,
      preserveDrawingBuffer: true, // lets the glitch transition snapshot the map
      fadeDuration: 0,
    })
    map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-left')
    mapRef.current = map

    map.on('style.load', () => {
      map.addSource('mapbox-dem', { type: 'raster-dem', url: 'mapbox://mapbox.mapbox-terrain-dem-v1', tileSize: 512, maxzoom: 14 })
      map.setTerrain({ source: 'mapbox-dem', exaggeration: lite ? 1.2 : 1.6 })
      map.setFog({
        color: 'rgb(12,12,14)',
        'high-color': 'rgb(20,22,30)',
        'horizon-blend': 0.08,
        'space-color': 'rgb(10,10,11)',
        'star-intensity': 0,
      })
      map.addSource('hotspots', { type: 'geojson', data: hotspots })
      map.addLayer({
        id: 'risk-heat',
        type: 'heatmap',
        source: 'hotspots',
        paint: {
          'heatmap-weight': ['get', 'w'],
          'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 6, 1, 12, 2.5],
          'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 6, 14, 12, 40],
          'heatmap-opacity': 0.85,
          'heatmap-color': [
            'interpolate',
            ['linear'],
            ['heatmap-density'],
            0,
            'rgba(0,0,0,0)',
            0.2,
            'rgba(61,220,151,0.35)',
            0.5,
            'rgba(255,90,31,0.6)',
            0.85,
            'rgba(229,33,46,0.85)',
            1,
            'rgba(255,220,200,0.95)',
          ],
        },
      })
      map.addLayer({
        id: 'risk-points',
        type: 'circle',
        source: 'hotspots',
        minzoom: 9,
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['get', 'w'], 0, 3, 1, 7],
          'circle-color': ['interpolate', ['linear'], ['get', 'w'], 0.3, '#3DDC97', 0.6, '#FF5A1F', 0.85, '#E5212E'],
          'circle-stroke-color': '#0A0A0B',
          'circle-stroke-width': 1.5,
          'circle-opacity': 0.95,
        },
      })
    })

    const ro = new ResizeObserver(() => map.resize())
    ro.observe(el.current)

    // own flag: setBearing() during a flyTo would cancel the flight
    // (an interrupted flight also fires moveend, so only the latest flight may clear the flag)
    let flying = false
    let flight = 0
    const fly = () => {
      const id = ++flight
      flying = true
      map.flyTo({ ...VIEWS[sectionBus.get()], duration: 3200, curve: 1.4, essential: true })
      map.once('moveend', () => {
        if (id === flight) flying = false
      })
    }
    const off = sectionBus.on(fly)
    map.once('load', () => sectionBus.get() !== 'intro' && fly())

    // slow cinematic drift while a section is on screen
    let raf = 0
    const drift = () => {
      if (!flying) map.setBearing(map.getBearing() + 0.012)
      raf = requestAnimationFrame(drift)
    }
    map.once('idle', () => (raf = requestAnimationFrame(drift)))

    return () => {
      cancelAnimationFrame(raf)
      off()
      ro.disconnect()
      map.remove()
      mapRef.current = null
    }
  }, [enabled, lite])

  return (
    <div className="map" ref={el}>
      {!TOKEN && <div className="map__missing t-mono">Mapbox token missing (.env → VITE_MAPBOX_TOKEN)</div>}
    </div>
  )
}
