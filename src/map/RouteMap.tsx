import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import type { Coordinate, RiskSection, RouteResult } from '../data/demoRoute'
import type { GeoStatus, UserPosition } from '../demo/useGeolocation'
import { distanceKm, headingAlong } from '../demo/geo'
import type { NavCar } from './navCar'
import { applyLocalNames } from './localNames'
import { addStationsLayer } from './stationsLayer'

const token = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined
const colors = { high: '#FF3B30', medium: '#FFB340', low: '#E8BD7C' }

function lineFeature(coordinates: Coordinate[]) {
  return { type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates } }
}

const LOCATE_ICON =
  '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="4.2" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><path d="M12 2.5v3.2M12 18.3v3.2M2.5 12h3.2M18.3 12h3.2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'

/** "Show my location" button, stacked above the +/− zoom buttons. */
class LocateControl implements mapboxgl.IControl {
  private box = document.createElement('div')
  button = document.createElement('button')
  constructor(private onClick: () => void) {}
  onAdd() {
    this.box.className = 'mapboxgl-ctrl mapboxgl-ctrl-group safetycar-locate'
    this.button.type = 'button'
    this.button.className = 'safetycar-locate__btn'
    this.button.title = 'Моето местоположение'
    this.button.setAttribute('aria-label', 'Покажи моето местоположение')
    this.button.innerHTML = LOCATE_ICON
    this.button.addEventListener('click', () => this.onClick())
    this.box.append(this.button)
    return this.box
  }
  onRemove() {
    this.box.remove()
  }
}

type Props = {
  route: RouteResult
  selectedRisk: string | null
  mapStyle: 'satellite' | 'streets'
  resetViewSignal: number
  onSelectRisk: (id: string | null) => void
  userPosition: UserPosition | null
  locateStatus: GeoStatus
  navigating: boolean
  onLocate: () => void
  /** increments every time the user asks to see their position */
  locateSignal: number
}

export function RouteMap({ route, selectedRisk, mapStyle, resetViewSignal, onSelectRisk, userPosition, locateStatus, navigating, onLocate, locateSignal }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const map = useRef<mapboxgl.Map | null>(null)
  const markers = useRef<mapboxgl.Marker[]>([])
  const selectRef = useRef(onSelectRisk)
  selectRef.current = onSelectRisk
  const locateRef = useRef(onLocate)
  locateRef.current = onLocate
  const routeRef = useRef(route)
  routeRef.current = route
  const locateControl = useRef<LocateControl | null>(null)
  const navCar = useRef<NavCar | null>(null)
  const lastHeading = useRef(0)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!host.current || !token) return
    mapboxgl.accessToken = token
    const instance = new mapboxgl.Map({
      container: host.current,
      style: mapStyle === 'satellite' ? 'mapbox://styles/mapbox/satellite-streets-v12' : 'mapbox://styles/mapbox/streets-v12',
      center: [24.7, 42.4],
      zoom: 7,
      pitch: 58,
      bearing: -15,
      antialias: true,
      attributionControl: false,
    })
    map.current = instance
    if (import.meta.env.DEV) (window as unknown as { __routeMap: unknown }).__routeMap = instance
    let stopStations = () => {}
    instance.addControl(new mapboxgl.NavigationControl({ showCompass: false, visualizePitch: true }), 'bottom-right')
    // bottom controls stack upwards, so this one lands ABOVE the zoom buttons
    const locate = new LocateControl(() => locateRef.current())
    locateControl.current = locate
    instance.addControl(locate, 'bottom-right')
    instance.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-left')
    instance.on('style.load', () => {
      applyLocalNames(instance)
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
      updateMap(instance, routeRef.current, markers)
      stopStations = addStationsLayer(instance)
      setReady(true)
    })
    return () => {
      stopStations()
      setReady(false)
      navCar.current = null
      locateControl.current = null
      markers.current.forEach((marker) => marker.remove())
      instance.remove()
      map.current = null
    }
  }, [mapStyle])

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

  useEffect(() => {
    if (resetViewSignal && map.current?.isStyleLoaded()) fitRoute(map.current, route)
  }, [resetViewSignal, route])

  // locate button look: idle / searching / showing the car
  useEffect(() => {
    const button = locateControl.current?.button
    if (!button) return
    button.classList.toggle('is-locating', locateStatus === 'locating')
    button.classList.toggle('is-active', locateStatus === 'ready')
  }, [locateStatus, ready])

  // 3D car at the device position, heading along the route when on it
  useEffect(() => {
    const instance = map.current
    if (!instance || !ready || !userPosition) return
    let cancelled = false
    const here: Coordinate = [userPosition.lng, userPosition.lat]
    const onRoute = route.geometry.length > 1 && distanceKm(here, route.geometry[0]) < 3
    const heading = (navigating || onRoute ? headingAlong(route.geometry, here) : null) ?? userPosition.heading ?? lastHeading.current
    lastHeading.current = heading
    const place = (car: NavCar) => {
      if (!instance.getLayer(car.layer.id)) instance.addLayer(car.layer)
      car.set(here, heading)
    }
    if (navCar.current) place(navCar.current)
    else
      import('./navCar').then(({ createNavCar }) => {
        if (cancelled || map.current !== instance) return
        navCar.current = navCar.current ?? createNavCar()
        place(navCar.current)
      })
    if (navigating) {
      const h = instance.getContainer().clientHeight
      instance.easeTo({ center: here, bearing: heading, zoom: 16.4, pitch: 66, padding: { top: h * 0.42, bottom: 0, left: 0, right: 0 }, duration: 1100 })
    }
    return () => {
      cancelled = true
    }
  }, [userPosition, navigating, route, ready])

  // explicit "show me where I am"
  useEffect(() => {
    const instance = map.current
    if (!locateSignal || !instance || !ready || !userPosition || navigating) return
    instance.flyTo({ center: [userPosition.lng, userPosition.lat], zoom: 15.2, pitch: 60, bearing: lastHeading.current, padding: { top: 0, bottom: 0, left: 0, right: 0 }, duration: 1800, essential: true })
  }, [locateSignal, userPosition, ready, navigating])

  // leaving navigation: back to the whole route
  const wasNavigating = useRef(false)
  useEffect(() => {
    const instance = map.current
    if (wasNavigating.current && !navigating && instance?.isStyleLoaded()) {
      instance.easeTo({ padding: { top: 0, bottom: 0, left: 0, right: 0 }, duration: 0 })
      fitRoute(instance, route)
    }
    wasNavigating.current = navigating
  }, [navigating, route])

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
    const image = document.createElement('img')
    image.src = `/images/ui/pin-${index === 0 ? 'start' : 'end'}.webp`
    image.alt = index === 0 ? 'Начална точка' : 'Крайна точка'
    element.append(image)
    return new mapboxgl.Marker({ element, anchor: 'bottom' }).setLngLat(point).addTo(instance)
  })
  fitRoute(instance, route)
}

function fitRoute(instance: mapboxgl.Map, route: RouteResult) {
  const bounds = route.geometry.reduce((box, point) => box.extend(point), new mapboxgl.LngLatBounds(route.geometry[0], route.geometry[0]))
  // the map lives inside the CarPlay frame, so size padding by its container, not the window
  const wide = instance.getContainer().clientWidth > 1000
  instance.fitBounds(bounds, { padding: wide ? { top: 90, right: 370, bottom: 90, left: 480 } : { top: 100, right: 50, bottom: 100, left: 80 }, pitch: 58, bearing: -15, maxZoom: 10, duration: 850 })
}
