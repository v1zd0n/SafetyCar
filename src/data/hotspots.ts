/**
 * MOCK crash hotspots placed near well-known risky stretches of Bulgarian
 * roads. Values are illustrative only — replace with the real dataset
 * (МВР / АПИ / data.egov.bg) once the data pipeline is ready.
 */
type Spot = { lng: number; lat: number; w: number; name: string }

const seeds: Spot[] = [
  { lng: 23.16, lat: 41.78, w: 1, name: 'E79 · Кресненско дефиле' },
  { lng: 23.15, lat: 41.83, w: 0.8, name: 'E79 · Кресна' },
  { lng: 23.62, lat: 42.83, w: 0.9, name: 'A2 · Витиня' },
  { lng: 23.48, lat: 42.98, w: 0.7, name: 'I-1 · Искърско' },
  { lng: 23.27, lat: 43.05, w: 0.75, name: 'I-1 · Петрохан' },
  { lng: 25.33, lat: 42.75, w: 0.95, name: 'I-5 · Шипка' },
  { lng: 25.31, lat: 42.71, w: 0.7, name: 'I-5 · Шипченски проход' },
  { lng: 24.75, lat: 42.15, w: 0.85, name: 'A1 · Тракия, Пловдив' },
  { lng: 25.65, lat: 42.42, w: 0.65, name: 'A1 · Стара Загора' },
  { lng: 27.47, lat: 42.5, w: 0.7, name: 'I-9 · Бургас' },
  { lng: 27.8, lat: 43.2, w: 0.6, name: 'A2 · Варна' },
  { lng: 25.6, lat: 43.08, w: 0.6, name: 'I-5 · В. Търново' },
  { lng: 22.69, lat: 42.29, w: 0.55, name: 'I-1 · Кюстендил' },
  { lng: 23.1, lat: 42.02, w: 0.65, name: 'E79 · Благоевград' },
  { lng: 24.33, lat: 42.2, w: 0.55, name: 'A1 · Пазарджик' },
]

// Deterministic jitter so each seed becomes a small cluster.
function rand(i: number) {
  const x = Math.sin(i * 9301 + 49297) * 233280
  return x - Math.floor(x)
}

type PointFeature = {
  type: 'Feature'
  properties: { w: number; name: string }
  geometry: { type: 'Point'; coordinates: [number, number] }
}

export const hotspots: { type: 'FeatureCollection'; features: PointFeature[] } = {
  type: 'FeatureCollection',
  features: seeds.flatMap((s, si) =>
    Array.from({ length: 10 }, (_, i) => {
      const k = si * 10 + i
      return {
        type: 'Feature' as const,
        properties: { w: Math.max(0.15, s.w - rand(k) * 0.5), name: s.name },
        geometry: {
          type: 'Point' as const,
          coordinates: [s.lng + (rand(k + 1) - 0.5) * 0.06, s.lat + (rand(k + 2) - 0.5) * 0.04],
        },
      }
    }),
  ),
}

export type View = { center: [number, number]; zoom: number; pitch: number; bearing: number }

export const VIEWS: Record<'intro' | 'problem' | 'how' | 'features' | 'team', View> = {
  intro: { center: [25.3, 42.75], zoom: 6.3, pitch: 35, bearing: 0 },
  problem: { center: [23.165, 41.79], zoom: 12.2, pitch: 68, bearing: -18 },
  how: { center: [23.62, 42.83], zoom: 11.6, pitch: 62, bearing: 35 },
  features: { center: [25.325, 42.735], zoom: 12, pitch: 70, bearing: 140 },
  team: { center: [25.2, 42.65], zoom: 6.8, pitch: 45, bearing: -10 },
}
