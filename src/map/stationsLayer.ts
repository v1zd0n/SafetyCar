import mapboxgl from 'mapbox-gl'
import './stationsLayer.css'

// bgtoll.bg road weather stations (GET /api/live/stations): air and asphalt temperature.
// Dots from zoom 7, coloured by AIR temperature (green < 10° < yellow < 20° < orange < 30° < red);
// readable "17° въздух · 15° асфалт" labels on dark pills from zoom 7.5. A light-blue ring marks
// ice risk (asphalt at or below 0 °C). Refreshes every 5 minutes. Returns a cleanup function.
const REFRESH_MS = 5 * 60 * 1000

/** Temperature colour scale, shared with the map legend. */
export const TEMP_SCALE = [
  { below: 10, color: '#34C759', label: 'под 10°' },
  { below: 20, color: '#FFD60A', label: '10–20°' },
  { below: 30, color: '#FF9F0A', label: '20–30°' },
  { below: Infinity, color: '#FF3B30', label: 'над 30°' },
] as const
const NO_DATA = '#9AA0A6'
const ICE = '#4FC3F7'

export function tempColor(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return NO_DATA
  return TEMP_SCALE.find((step) => value < step.below)!.color
}

function stationsUrl() {
  const route = import.meta.env.VITE_ROUTE_API_URL as string | undefined
  return route ? route.replace(/\/route\/?$/, '/live/stations') : null
}

type Expr = mapboxgl.ExpressionSpecification
const colorExpr = (key: string): Expr => [
  'case',
  ['==', ['get', key], null], NO_DATA,
  ['<', ['get', key], TEMP_SCALE[0].below], TEMP_SCALE[0].color,
  ['<', ['get', key], TEMP_SCALE[1].below], TEMP_SCALE[1].color,
  ['<', ['get', key], TEMP_SCALE[2].below], TEMP_SCALE[2].color,
  TEMP_SCALE[3].color,
]
const isIce: Expr = ['any', ['==', ['get', 'ice_risk'], true], ['all', ['!=', ['get', 'surface'], null], ['<=', ['get', 'surface'], 0]]]
const deg = (key: string): Expr => ['concat', ['number-format', ['get', key], { 'max-fraction-digits': 0 }], '°']

/** Dark rounded "pill" behind each label (9-slice stretchable, so it fits any text). */
function pillImage() {
  const w = 48
  const h = 32
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d')!
  g.fillStyle = 'rgba(17, 17, 19, 0.9)'
  g.strokeStyle = 'rgba(255, 255, 255, 0.22)'
  g.lineWidth = 2
  g.beginPath()
  g.roundRect(1, 1, w - 2, h - 2, 12)
  g.fill()
  g.stroke()
  return g.getImageData(0, 0, w, h)
}

export function addStationsLayer(map: mapboxgl.Map): () => void {
  const url = stationsUrl()
  if (!url) return () => {}
  if (!map.hasImage('station-pill')) {
    map.addImage('station-pill', pillImage(), { pixelRatio: 2, stretchX: [[14, 34]], stretchY: [[13, 19]], content: [10, 6, 38, 26] })
  }
  map.addSource('stations', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
  // soft dark halo so the dots read on satellite imagery
  map.addLayer({
    id: 'station-halo', type: 'circle', source: 'stations', minzoom: 7,
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 7, 9, 11, 14],
      'circle-color': '#000000', 'circle-opacity': 0.4, 'circle-blur': 0.6,
    },
  })
  map.addLayer({
    id: 'station-dot', type: 'circle', source: 'stations', minzoom: 7,
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 7, 5.5, 11, 9],
      'circle-color': colorExpr('air'),
      'circle-stroke-color': ['case', isIce, ICE, '#FFFFFF'],
      'circle-stroke-width': ['case', isIce, 3, 2],
    },
  })
  map.addLayer({
    id: 'station-label', type: 'symbol', source: 'stations', minzoom: 7.5,
    layout: {
      'text-field': ['case',
        ['==', ['get', 'surface'], null],
        ['format', deg('air'), { 'text-color': colorExpr('air'), 'font-scale': 1.12 }, ' въздух', { 'text-color': '#D4D4D8' }],
        ['format',
          deg('air'), { 'text-color': colorExpr('air'), 'font-scale': 1.12 }, ' въздух', { 'text-color': '#D4D4D8' },
          '  ·  ', { 'text-color': '#71717A' },
          deg('surface'), { 'text-color': ['case', isIce, ICE, colorExpr('surface')], 'font-scale': 1.12 }, ' асфалт', { 'text-color': '#D4D4D8' }],
      ],
      'text-font': ['DIN Pro Bold', 'Arial Unicode MS Bold'],
      'text-size': ['interpolate', ['linear'], ['zoom'], 7.5, 11.5, 11, 13.5],
      'text-anchor': 'top', 'text-offset': [0, 1.35], 'text-max-width': 40, // one line: "17° въздух · 13° асфалт"
      'icon-image': 'station-pill', 'icon-text-fit': 'both', 'icon-text-fit-padding': [4, 8, 4, 8],
      'text-allow-overlap': false, 'icon-allow-overlap': false, 'text-optional': false,
    },
    paint: { 'text-color': '#F4F4F5' },
  })

  const popup = new mapboxgl.Popup({ closeButton: false, offset: 12, className: 'station-popup', maxWidth: '270px' })
  map.on('click', 'station-dot', (event) => {
    type Props = { name: string; air: number; surface: number | null; humidity: number | null; wind: number | null; ts_utc: string; ice_risk?: boolean }
    const p = (event.features?.[0] as unknown as { properties?: Props } | undefined)?.properties
    if (!p) return
    const time = new Date(p.ts_utc).toLocaleTimeString('bg-BG', { hour: '2-digit', minute: '2-digit' })
    const has = (v: unknown) => v != null && String(v) !== 'null'
    const surface = has(p.surface) ? Number(p.surface) : null
    const ice = String(p.ice_risk) === 'true' || (surface != null && surface <= 0)
    const chip = (value: number, label: string, color: string) =>
      `<span class="temp"><i style="background:${color}"></i><b style="color:${color}">${Math.round(value)}°</b> ${label}</span>`
    popup.setLngLat(event.lngLat).setHTML(
      `<strong>${p.name}</strong><div class="temps">` +
      chip(Number(p.air), 'въздух', tempColor(Number(p.air))) +
      (surface != null ? chip(surface, 'асфалт', ice ? ICE : tempColor(surface)) : '<span class="temp muted">асфалт: няма данни</span>') +
      `</div>` +
      (ice ? '<div class="ice">Опасност от заледяване</div>' : '') +
      (has(p.wind) ? `<div class="meta">вятър ${p.wind} м/с${has(p.humidity) ? ` · влажност ${p.humidity}%` : ''}</div>` : '') +
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
