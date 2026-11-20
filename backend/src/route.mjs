// POST /api/route: risk along a driving route, in the format the /demo page expects (docs/route-api.md).
//   route geometry: Mapbox Directions (driving), server-side with MAPBOX_TOKEN (or VITE_MAPBOX_TOKEN)
//   risks: api.route_risk() (backend/sql/route.sql): 3-km sections on the route with baseline class + live АПИ status
import express from 'express'
import { env, query } from './db.mjs'

export const routeRouter = express.Router()

// GET /api/live/stations — bgtoll.bg road weather stations (МТО) as GeoJSON points: air and asphalt temperature.
// Latest working reading per station, max 90 min old (live.station_now). surface is null where the station sends
// no asphalt value. ice_risk = asphalt at or below 0 °C.
routeRouter.get('/live/stations', async (req, res, next) => {
  try {
    const { rows } = await query(`select station_id, name, ts_utc, round(air::numeric, 1)::float8 as air,
        round(surface::numeric, 1)::float8 as surface, round(humidity::numeric)::float8 as humidity,
        round(wind::numeric, 1)::float8 as wind,
        st_asgeojson(st_transform(geom_m, 4326), 5)::json as g
      from live.station_now`)
    res.set('Cache-Control', 'public, max-age=120').json({
      type: 'FeatureCollection',
      features: rows.map(({ g, ...p }) => ({ type: 'Feature', geometry: g, properties: { ...p, ice_risk: p.surface != null && p.surface <= 0 } })),
    })
  } catch (e) { next(e) }
})

const LEVEL_TEXT = { high: 'Повишен риск', medium: 'Среден риск', low: 'Нисък риск' }
const inBulgaria = c => Array.isArray(c) && c.length === 2 && c.every(Number.isFinite) &&
  c[0] > 22 && c[0] < 29 && c[1] > 41 && c[1] < 44.5

async function directions(from, to) {
  const token = (env('MAPBOX_TOKEN') ?? env('VITE_MAPBOX_TOKEN') ?? '').trim()
  if (!token) throw Object.assign(new Error('MAPBOX_TOKEN is not set'), { status: 503 })
  const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${from.join(',')};${to.join(',')}` +
    `?geometries=geojson&overview=full&access_token=${encodeURIComponent(token)}`
  const r = await fetch(url, { signal: AbortSignal.timeout(20000) })
  if (!r.ok) throw Object.assign(new Error(`directions: HTTP ${r.status}`), { status: 502 })
  const route = (await r.json()).routes?.[0]
  if (!route) throw Object.assign(new Error('no route found'), { status: 404 })
  return route
}

function describe(row) {
  const parts = []
  const reason = row.reasons?.find?.(x => !x.estimated) ?? row.reasons?.[0]
  if (reason?.bg) parts.push(reason.bg + (reason.detail ? ` (${reason.detail})` : ''))
  if (row.base_class) parts.push(`базов клас ${row.base_class} от 5`)
  const ev = row.events?.[0]
  if (ev) parts.push('Съобщение от АПИ: ' + (ev.description ?? ev.kind))
  return parts.join(' · ') || LEVEL_TEXT[row.level]
}

// GET /api/places — cities and towns in Bulgaria for the start/end fields of /demo (OSM place=city|town)
routeRouter.get('/places', async (req, res, next) => {
  try {
    const { rows } = await query('select name, place, lon, lat from api.places order by place, name')
    res.set('Cache-Control', 'public, max-age=86400').json(rows.map(r => ({
      id: `${r.lon},${r.lat}`, name: r.name, kind: r.place, coordinates: [r.lon, r.lat] })))
  } catch (e) { next(e) }
})

// GET /api/sections/:sectionId — one ~3-km section (id from /api/route or /api/live/sections, e.g. A1:dual:1:19):
// baseline score and reasons of its 1-km segments, crash history, live АПИ status for both vehicle classes.
routeRouter.get('/sections/:sectionId', async (req, res, next) => {
  try {
    const m = /^([^:]+):(single|dual):(\d+):(\d+)$/.exec(req.params.sectionId)
    if (!m) return res.status(400).json({ error: 'section id must look like A1:dual:1:19' })
    const key = [m[1], m[2], +m[3], +m[4]]
    const where = 's.road = $1 and s.carriageway = $2 and s.part_no = $3 and (s.piece_no - 1) / 3 + 1 = $4'
    const segs = await query(`select s.seg_id, s.piece_no, s.km_from, s.km_to, s.length_m, s.oblast, s.municipality, s.settlement,
        s.in_settlement, s.road_class, x.class, x.priority, x.score, x.reactive_level, x.proactive_level, x.top_reasons, x.fixes,
        st_asgeojson(s.geom, 6)::json as geometry
      from segments s left join analysis.segment_scores x using (seg_id) where ${where} order by s.piece_no`, key)
    if (!segs.rows.length) return res.status(404).json({ error: 'section not found' })
    const ids = segs.rows.map(r => r.seg_id)
    const [years, types, live] = await Promise.all([
      query(`select year, sum(n_crashes)::int n_crashes, sum(n_fatal)::int n_fatal, sum(n_injury)::int n_injury,
               sum(n_killed)::int n_killed, sum(n_injured)::int n_injured, sum(n_night)::int n_night, sum(n_fog)::int n_fog,
               sum(n_rain)::int n_rain, sum(n_ice)::int n_ice, sum(n_wind)::int n_wind
             from segment_year_stats where seg_id = any($1) group by year order by year`, [ids]),
      query(`select type_group, count(*)::int n, count(*) filter (where severity <> 'damage')::int serious
             from crashes where seg_id = any($1) and not in_settlement group by 1 order by 2 desc`, [ids]),
      query(`select vehicle, risk_score, risk_level, access_status, events, oldest_publication_at,
               oldest_publication_at > now() - interval '45 minutes' as fresh
             from live.road_status_sections where section_id = $1`, [req.params.sectionId]),
    ])
    const s = segs.rows
    const scored = s.filter(r => r.score != null)
    const best = [...scored].sort((a, b) => b.score - a.score)[0]
    const liveFor = v => {
      const r = live.rows.find(x => x.vehicle === v)
      if (!r) return null
      return r.fresh ? { risk_score: r.risk_score, risk_level: r.risk_level, access_status: r.access_status, events: r.events, updated_at: r.oldest_publication_at }
        : { risk_score: null, risk_level: 'unknown', access_status: 'unknown', events: [], updated_at: r.oldest_publication_at }
    }
    res.json({
      type: 'Feature',
      geometry: { type: 'MultiLineString', coordinates: s.map(r => r.geometry.coordinates) },
      properties: {
        section_id: req.params.sectionId, road: m[1], road_class: s[0].road_class, carriageway: m[2],
        km_from: s[0].km_from, km_to: s.at(-1).km_to, length_m: s.reduce((a, r) => a + r.length_m, 0),
        oblast: s[0].oblast, municipality: s[0].municipality, settlement: s.find(r => r.settlement)?.settlement ?? null,
        base_class: scored.length ? Math.max(...scored.map(r => r.class ?? 0)) : null,
        base_score: best?.score ?? null,
        top_reasons: best?.top_reasons ?? [], fixes: best?.fixes ?? [],
        live: { car: liveFor('car'), heavy: liveFor('heavy') },
        crashes_by_year: years.rows, crashes_by_type: types.rows,
        segments: s.map(({ geometry: _g, top_reasons: _t, fixes: _f, ...r }) => r),
        note: 'Crash counts: crashes with coordinates outside settlements; 2025 covers 1 Jan - 13 Apr. km are along OSM lines, not АПИ km posts.',
      },
    })
  } catch (e) { next(e) }
})

routeRouter.post('/route', express.json({ limit: '20kb' }), async (req, res, next) => {
  try {
    const { origin, destination, vehicleType = 'car' } = req.body ?? {}
    const from = origin?.coordinates, to = destination?.coordinates
    if (!inBulgaria(from) || !inBulgaria(to)) return res.status(400).json({ error: 'origin/destination coordinates [lon, lat] in Bulgaria are required' })
    if (!['car', 'truck'].includes(vehicleType)) return res.status(400).json({ error: 'vehicleType must be car or truck' })

    const route = await directions(from, to)
    const { rows } = await query('select * from api.route_risk($1, $2)', [JSON.stringify(route.geometry), vehicleType === 'truck'])
    res.json({
      id: `${from.join(',')}-${to.join(',')}-${vehicleType}`,
      distanceKm: Math.round(route.distance / 100) / 10,
      durationMinutes: Math.round(route.duration / 60),
      geometry: route.geometry.coordinates,
      risks: rows.map(r => ({
        id: r.risk_id,
        name: [r.oblast, `${r.length_km} км`].filter(Boolean).join(' · '),
        road: r.road,
        level: r.level,
        description: describe(r),
        lengthKm: r.length_km,
        geometry: r.geometry.coordinates,
        sections: r.sections,
        baseClass: r.base_class,
        liveLevel: r.live_level,
        events: r.events,
      })),
    })
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message })
    next(e)
  }
})
