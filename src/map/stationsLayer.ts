import mapboxgl from 'mapbox-gl'
import './stationsLayer.css'

// bgtoll.bg road weather stations (GET /api/live/stations): air and asphalt temperature.
// Dots from zoom 7, "въздух / асфалт" labels from zoom 8. Blue = asphalt at or below 0 °C (ice risk),
// amber = up to 3 °C. Refreshes every 5 minutes. Returns a cleanup function.
const REFRESH_MS = 5 * 60 * 1000

function stationsUrl() {
  const route = import.meta.env.VITE_ROUTE_API_URL as string | undefined
  return route ? route.replace(/\/route\/?$/, '/live/stations') : null
}

const temp = (key: string) => ['concat', ['number-format', ['get', key], { 'max-fraction-digits': 0 }], '°']

export function addStationsLayer(map: mapboxgl.Map): () => void {
  const url = stationsUrl()
  if (!url) return () => {}
  map.addSource('stations', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
  map.addLayer({
    id: 'station-dot', type: 'circle', source: 'stations', minzoom: 7,
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 7, 4, 11, 8],
      'circle-color': ['case',
        ['==', ['get', 'surface'], null], '#9AA0A6',
        ['<=', ['get', 'surface'], 0], '#4FC3F7',
        ['<=', ['get', 'surface'], 3], '#FFB340',
        '#F4F4F5'],
      'circle-stroke-color': '#0A0A0B', 'circle-stroke-width': 1.5,
    },
  })
  map.addLayer({
    id: 'station-label', type: 'symbol', source: 'stations', minzoom: 8,
    layout: {
      'text-field': ['case',
        ['==', ['get', 'surface'], null], ['concat', 'въздух ', temp('air')],
        ['concat', 'въздух ', temp('air'), ' · асфалт ', temp('surface')]],
      'text-font': ['DIN Pro Medium', 'Arial Unicode MS Regular'],
      'text-size': 12, 'text-offset': [0, 1.3], 'text-anchor': 'top', 'text-allow-overlap': false,
    },
    paint: { 'text-color': '#F4F4F5', 'text-halo-color': '#0A0A0B', 'text-halo-width': 1.5 },
  })

  const popup = new mapboxgl.Popup({ closeButton: false, offset: 10, className: 'station-popup', maxWidth: '260px' })
  map.on('click', 'station-dot', (event) => {
    type Props = { name: string; air: number; surface: number | null; humidity: number | null; wind: number | null; ts_utc: string }
    const p = (event.features?.[0] as unknown as { properties?: Props } | undefined)?.properties
    if (!p) return
    const time = new Date(p.ts_utc).toLocaleTimeString('bg-BG', { hour: '2-digit', minute: '2-digit' })
    const has = (v: unknown) => v != null && String(v) !== 'null'
    const ice = has(p.surface) && Number(p.surface) <= 0
    popup.setLngLat(event.lngLat).setHTML(
      `<strong>${p.name}</strong><div class="temps">въздух <b>${Math.round(p.air)}°</b>` +
      (has(p.surface) ? ` · асфалт <b class="${ice ? 'ice' : ''}">${Math.round(Number(p.surface))}°</b>` : ' · асфалт: няма данни') +
      `</div>` + (has(p.wind) ? `вятър ${p.wind} м/с` : '') +
      `<small>метеостанция bgtoll, ${time}</small>`).addTo(map)
  })
  map.on('mouseenter', 'station-dot', () => { map.getCanvas().style.cursor = 'pointer' })
  map.on('mouseleave', 'station-dot', () => { map.getCanvas().style.cursor = '' })

  const load = () => fetch(url).then((r) => (r.ok ? r.json() : null)).then((data) => {
    if (data) (map.getSource('stations') as mapboxgl.GeoJSONSource | undefined)?.setData(data)
  }).catch(() => {})
  load()
  const timer = window.setInterval(load, REFRESH_MS)
  return () => { window.clearInterval(timer); popup.remove() }
}
