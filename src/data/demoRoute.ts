export type VehicleType = 'car' | 'truck'
export type RiskLevel = 'high' | 'medium' | 'low'
export type Coordinate = [number, number]

export type Place = { id: string; name: string; coordinates: Coordinate }
export type RiskSection = {
  id: string
  name: string
  road: string
  level: RiskLevel
  description: string
  lengthKm: number
  geometry: Coordinate[]
}
export type RouteResult = {
  id: string
  source: 'demo' | 'backend'
  distanceKm: number
  durationMinutes: number
  geometry: Coordinate[]
  risks: RiskSection[]
}

// Demo coordinates follow the Sofia–Burgas corridor approximately. They are
// illustrative, not navigation instructions or measured accident statistics.
const corridor: Coordinate[] = [
  [23.3219, 42.6977], [23.402, 42.653], [23.492, 42.59], [23.615, 42.538],
  [23.74, 42.484], [23.87, 42.426], [24.01, 42.35], [24.16, 42.258],
  [24.334, 42.201], [24.49, 42.183], [24.63, 42.174], [24.745, 42.135],
  [24.826, 42.146], [24.96, 42.19], [25.13, 42.246], [25.316, 42.294],
  [25.47, 42.36], [25.62, 42.425], [25.75, 42.469], [25.91, 42.482],
  [26.08, 42.5], [26.25, 42.52], [26.45, 42.56], [26.66, 42.568],
  [26.83, 42.57], [27.01, 42.54], [27.21, 42.52], [27.47, 42.504],
]

export const places: Place[] = [
  { id: 'sofia', name: 'София', coordinates: corridor[0] },
  { id: 'pazardzhik', name: 'Пазарджик', coordinates: corridor[8] },
  { id: 'plovdiv', name: 'Пловдив', coordinates: corridor[11] },
  { id: 'stara-zagora', name: 'Стара Загора', coordinates: corridor[17] },
  { id: 'burgas', name: 'Бургас', coordinates: corridor[27] },
]

const placeIndex: Record<string, number> = {
  sofia: 0, pazardzhik: 8, plovdiv: 11, 'stara-zagora': 17, burgas: 27,
}

const demoRisks: (Omit<RiskSection, 'geometry'> & { from: number; to: number })[] = [
  { id: 'r1', name: 'Вакарел — Ихтиман', road: 'A1 · Тракия', level: 'high', description: 'Демонстрационен участък с повишен риск', lengthKm: 18.4, from: 3, to: 6 },
  { id: 'r2', name: 'Пазарджик — Пловдив', road: 'A1 · Тракия', level: 'medium', description: 'Демонстрационен участък със среден риск', lengthKm: 21.6, from: 8, to: 11 },
  { id: 'r3', name: 'Чирпан — Стара Загора', road: 'A1 · Тракия', level: 'low', description: 'Демонстрационен участък с нисък риск', lengthKm: 15.2, from: 14, to: 17 },
]

/** Corridor index of a place: known demo city, else the nearest corridor point (e.g. "my location"). */
function corridorIndex(place: Place) {
  if (place.id in placeIndex) return placeIndex[place.id]
  let best = 0
  let bestD = Infinity
  corridor.forEach(([lng, lat], i) => {
    const d = (lng - place.coordinates[0]) ** 2 + (lat - place.coordinates[1]) ** 2
    if (d < bestD) {
      bestD = d
      best = i
    }
  })
  return best
}

function km(a: Coordinate, b: Coordinate) {
  const rad = (d: number) => (d * Math.PI) / 180
  const h = Math.sin(rad(b[1] - a[1]) / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(rad(b[0] - a[0]) / 2) ** 2
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)))
}

export function makeDemoRoute(origin: Place, destination: Place, vehicle: VehicleType): RouteResult {
  const start = corridorIndex(origin)
  const end = corridorIndex(destination)
  const forward = start <= end
  const low = Math.min(start, end)
  const high = Math.max(start, end)
  const geometry = corridor.slice(low, high + 1)
  if (!forward) geometry.reverse()
  // a start/end that is not a demo city (e.g. the device location) joins the corridor
  if (!(origin.id in placeIndex)) geometry.unshift(origin.coordinates)
  if (!(destination.id in placeIndex)) geometry.push(destination.coordinates)
  const risks = demoRisks.filter((risk) => risk.from >= low && risk.to <= high).map(({ from, to, ...risk }) => ({
    ...risk,
    geometry: forward ? corridor.slice(from, to + 1) : corridor.slice(from, to + 1).reverse(),
  }))
  let lengthKm = 0
  for (let i = 1; i < geometry.length; i++) lengthKm += km(geometry[i - 1], geometry[i])
  const distanceKm = Math.round(lengthKm * 1.18) // road distance is longer than the straight segments
  return {
    id: `${origin.id}-${destination.id}-${vehicle}`,
    source: 'demo',
    distanceKm,
    durationMinutes: Math.round(distanceKm / (vehicle === 'truck' ? 67 : 88) * 60),
    geometry,
    risks,
  }
}

// All cities and towns from the backend (GET /api/places, next to the route endpoint).
// Without a backend, or if it fails, the five demo places stay.
export async function loadPlaces(): Promise<Place[]> {
  const endpoint = import.meta.env.VITE_ROUTE_API_URL as string | undefined
  if (!endpoint) return places
  try {
    const response = await fetch(endpoint.replace(/\/route\/?$/, '/places'))
    if (!response.ok) return places
    const list: Place[] = await response.json()
    return Array.isArray(list) && list.length ? list : places
  } catch {
    return places
  }
}

export async function loadRoute(origin: Place, destination: Place, vehicle: VehicleType): Promise<RouteResult> {
  const endpoint = import.meta.env.VITE_ROUTE_API_URL as string | undefined
  if (!endpoint) return makeDemoRoute(origin, destination, vehicle)
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ origin, destination, vehicleType: vehicle }),
  })
  if (!response.ok) throw new Error('Маршрутът не може да бъде зареден. Опитайте отново.')
  const data: RouteResult = await response.json()
  if (!Array.isArray(data.geometry) || !Array.isArray(data.risks)) throw new Error('Невалидни данни за маршрута.')
  return { ...data, source: 'backend' }
}
