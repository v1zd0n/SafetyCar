import type { Coordinate } from '../data/demoRoute'

const R = 6371 // km
const rad = (d: number) => (d * Math.PI) / 180

/** Great-circle distance in km. */
export function distanceKm(a: Coordinate, b: Coordinate) {
  const dLat = rad(b[1] - a[1])
  const dLng = rad(b[0] - a[0])
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Initial bearing a → b in degrees clockwise from north. */
export function bearing(a: Coordinate, b: Coordinate) {
  const φ1 = rad(a[1])
  const φ2 = rad(b[1])
  const Δλ = rad(b[0] - a[0])
  const y = Math.sin(Δλ) * Math.cos(φ2)
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ)
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
}

export function nearestIndex(line: Coordinate[], p: Coordinate) {
  let best = 0
  let bestD = Infinity
  line.forEach((q, i) => {
    const d = distanceKm(p, q)
    if (d < bestD) {
      bestD = d
      best = i
    }
  })
  return { index: best, km: bestD }
}

/** Heading along the route from the point closest to `p`. */
export function headingAlong(line: Coordinate[], p: Coordinate) {
  if (line.length < 2) return null
  const { index } = nearestIndex(line, p)
  const next = line[Math.min(index + 1, line.length - 1)]
  const from = index + 1 < line.length ? p : line[index - 1]
  return bearing(from, next)
}

export function lineLengthKm(line: Coordinate[]) {
  let total = 0
  for (let i = 1; i < line.length; i++) total += distanceKm(line[i - 1], line[i])
  return total
}
