import { useEffect, useRef } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import type { Coordinate, RiskSection, RouteResult } from '../data/demoRoute'

const token = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined
const colors = { high: '#FF3B30', medium: '#FFB340', low: '#E8BD7C' }

function lineFeature(coordinates: Coordinate[]) {
  return { type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates } }
}

export function RouteMap({ route, selectedRisk, onSelectRisk }: {
  route: RouteResult
  selectedRisk: string | null
  onSelectRisk: (id: string | null) => void
}) {
  const host = useRef<HTMLDivElement>(null)
  const map = useRef<mapboxgl.Map | null>(null)
  const markers = useRef<mapboxgl.Marker[]>([])
  const selectRef = useRef(onSelectRisk)
  selectRef.current = onSelectRisk

  useEffect(() => {
    if (!host.current || !token) return
    mapboxgl.accessToken = token
    const instance = new mapboxgl.Map({
      container: host.current,
      style: 'mapbox://styles/mapbox/satellite-streets-v12',
      center: [24.7, 42.4],
      zoom: 7,
      pitch: 58,
      bearing: -15,
      antialias: true,
      attributionControl: false,
    })
    map.current = instance
    instance.addControl(new mapboxgl.NavigationControl({ showCompass: true, visualizePitch: true }), 'bottom-right')
    instance.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-left')
    instance.on('style.load', () => {
      if (!instance.getSource('terrain-dem')) instance.addSource('terrain-dem', { type: 'raster-dem', url: 'mapbox://mapbox.mapbox-terrain-dem-v1', tileSize: 512, maxzoom: 14 })
      instance.setTerrain({ source: 'terrain-dem', exaggeration: 1.35 })
    })
    instance.on('load', () => {
      instance.addSource('route', { type: 'geojson', data: lineFeature([]) })
      instance.addLayer({ id: 'route-halo', type: 'line', source: 'route', paint: { 'line-color': '#28160c', 'line-width': 13, 'line-opacity': 0.92 } })
      instance.addLayer({ id: 'route-line', type: 'line', source: 'route', paint: { 'line-color': '#FF7A32', 'line-width': 5, 'line-opacity': 0.98 } })
      instance.addSource('risks', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      instance.addLayer({ id: 'risk-halo', type: 'line', source: 'risks', paint: { 'line-color': '#26170f', 'line-width': 15 } })
      instance.addLayer({
        id: 'risk-lines', type: 'line', source: 'risks',
        paint: {
          'line-color': ['match', ['get', 'level'], 'high', colors.high, 'medium', colors.medium, colors.low],
          'line-width': ['match', ['get', 'level'], 'high', 10, 7],
          'line-opacity': 1,
        },
      })
      instance.on('click', 'risk-lines', (event) => {
        const id = (event.features?.[0] as unknown as { properties?: { id?: string } } | undefined)?.properties?.id
        if (id) selectRef.current(id)
      })
      instance.on('mouseenter', 'risk-lines', () => { instance.getCanvas().style.cursor = 'pointer' })
      instance.on('mouseleave', 'risk-lines', () => { instance.getCanvas().style.cursor = '' })
      updateMap(instance, route, markers)
    })
    return () => { markers.current.forEach((marker) => marker.remove()); instance.remove(); map.current = null }
  // Create the map once; later route changes update its GeoJSON sources.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (map.current?.isStyleLoaded()) updateMap(map.current, route, markers)
  }, [route])

  useEffect(() => {
    const instance = map.current
    if (!instance?.getLayer('risk-lines')) return
    instance.setPaintProperty('risk-lines', 'line-width', ['case', ['==', ['get', 'id'], selectedRisk ?? ''], 14, ['match', ['get', 'level'], 'high', 10, 7]])
    const risk = route.risks.find((item) => item.id === selectedRisk)
    if (risk) instance.flyTo({ center: risk.geometry[Math.floor(risk.geometry.length / 2)], zoom: 10.5, pitch: 65, duration: 900 })
  }, [selectedRisk, route])

  if (!token) return <div className="route-map route-map--missing"><div className="map-empty"><span>◈</span><strong>Картата очаква Mapbox ключ</strong><small>Добавете VITE_MAPBOX_TOKEN в .env, за да видите трасето и рисковите участъци.</small></div></div>
  return <div ref={host} className="route-map" role="application" aria-label="Карта на маршрута" />
}

function updateMap(instance: mapboxgl.Map, route: RouteResult, markers: { current: mapboxgl.Marker[] }) {
  const routeSource = instance.getSource('route') as mapboxgl.GeoJSONSource | undefined
  const riskSource = instance.getSource('risks') as mapboxgl.GeoJSONSource | undefined
  routeSource?.setData(lineFeature(route.geometry))
  riskSource?.setData({
    type: 'FeatureCollection',
    features: route.risks.map((risk: RiskSection) => ({
      type: 'Feature' as const,
      properties: { id: risk.id, level: risk.level, name: risk.name },
      geometry: { type: 'LineString' as const, coordinates: risk.geometry },
    })),
  })
  markers.current.forEach((marker) => marker.remove())
  markers.current = [route.geometry[0], route.geometry[route.geometry.length - 1]].map((point, index) => {
    const element = document.createElement('div')
    element.className = `route-pin route-pin--${index === 0 ? 'start' : 'end'}`
    element.textContent = index === 0 ? 'A' : 'B'
    return new mapboxgl.Marker({ element }).setLngLat(point).addTo(instance)
  })
  const bounds = route.geometry.reduce((box, point) => box.extend(point), new mapboxgl.LngLatBounds(route.geometry[0], route.geometry[0]))
  const wide = window.innerWidth > 1050
  instance.fitBounds(bounds, { padding: wide ? { top: 90, right: 355, bottom: 90, left: 465 } : { top: 100, right: 50, bottom: 100, left: 80 }, pitch: 58, bearing: -15, maxZoom: 10, duration: 850 })
}
