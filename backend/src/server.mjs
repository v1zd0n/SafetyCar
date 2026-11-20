// SafetyCar API. Endpoints: docs/api.md.
//   PORT (default 8787), CORS_ORIGIN (default *), LIVE_POLL=1 to run the live pollers in this process.
import express from 'express'
import { env, pool, query } from './db.mjs'
import { startPolling } from './live/poll.mjs'
import { routeRouter } from './route.mjs'

const app = express()
app.disable('x-powered-by')
app.set('json spaces', 0)

const CORS = env('CORS_ORIGIN') ?? '*'
app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', CORS)
  res.set('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') return res.sendStatus(204)
  next()
})

const api = express.Router()
const wrap = fn => (req, res, next) => fn(req, res).catch(next)
const bad = (res, msg) => res.status(400).json({ error: msg })
const int = (v, def, min, max) => {
  const n = Number.parseInt(v ?? '', 10)
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def
}
const bbox = s => {
  if (!s) return null
  const b = String(s).split(',').map(Number)
  return b.length === 4 && b.every(Number.isFinite) ? b : undefined
}
const feature = (geom, props) => ({ type: 'Feature', geometry: geom, properties: props })
const collection = features => ({ type: 'FeatureCollection', features })

// small in-memory cache for the slow network-wide live query
// (stale entries are served while a refresh runs, so only the very first request ever waits)
const cache = new Map()
async function cached(key, ttlMs, fn) {
  const hit = cache.get(key)
  if (hit && hit.until > Date.now()) return hit.value
  const refresh = (hit?.pending ?? fn().then(value => {
    cache.set(key, { value, until: Date.now() + ttlMs })
    return value
  }).finally(() => { const h = cache.get(key); if (h) delete h.pending }))
  if (hit) {
    hit.pending = refresh
    return hit.value ?? refresh            // stale value if we have one, otherwise wait for the first result
  }
  cache.set(key, { value: null, until: 0, pending: refresh })
  return refresh
}

// ---- meta ---------------------------------------------------------------------------------------------------------
api.get('/health', wrap(async (req, res) => {
  const { rows } = await query(`select now() as db_time, (select count(*) from analysis.segment_scores) as segments,
    (select coalesce(json_agg(f order by feed), '[]') from live.feed_status f) as feeds`)
  res.json({ ok: true, ...rows[0] })
}))

api.get('/meta', wrap(async (req, res) => {
  const [v, m, w] = await Promise.all([
    query('select metric, value, note from analysis.validation order by metric'),
    query('select condition, rr, ci_low, ci_high, multiplier from api.weather_multipliers order by condition'),
    query('select term, coef from analysis.weights order by term'),
  ])
  res.set('Cache-Control', 'public, max-age=3600').json({
    data_period: { crashes: ['2021-01-01', '2025-04-13'], score_years: [2021, 2024], weather_years: ['2023-04-14', '2025-04-13'] },
    score: { default_weights: { reactive: 0.6, proactive: 0.4 }, formula: 'score = w_r * reactive_pct + w_p * proactive_pct' },
    classes: { 1: 'very_low', 2: 'low', 3: 'medium', 4: 'high', 5: 'very_high' },
    live_levels: { low: [0, 35], moderate: [35, 60], high: [60, 80], very_high: [80, 100], blocked: 'access blocked' },
    weather_multipliers: m.rows, weights: w.rows, validation: v.rows,
  })
}))

// ---- risk map (1-km segments) --------------------------------------------------------------------------------------
async function tile(res, sql, params) {
  const { rows } = await query(sql, params)
  res.type('application/vnd.mapbox-vector-tile').set('Cache-Control', 'public, max-age=3600').send(rows[0].tile ?? Buffer.alloc(0))
}
api.get('/tiles/risk/:z/:x/:y.pbf', wrap(async (req, res) => {
  const { z, x, y } = req.params
  await tile(res, 'select api.segment_risk_mvt($1, $2, $3) as tile', [+z, +x, +y])
}))
api.get('/tiles/crashes/:z/:x/:y.pbf', wrap(async (req, res) => {
  const { z, x, y } = req.params
  await tile(res, 'select api.crashes_mvt($1, $2, $3, $4, $5) as tile',
    [+z, +x, +y, int(req.query.from, 2021, 2021, 2025), int(req.query.to, 2025, 2021, 2025)])
}))

api.get('/segments/:segId', wrap(async (req, res) => {
  const id = req.params.segId
  const seg = await query(`select seg_id, road, road_class, carriageway, km_from, km_to, length_m, oblast, municipality, settlement,
      in_settlement, assessed, class, priority, score, priority_rank, reactive_level, reactive_pct, proactive_level, proactive_s,
      proactive_pct, dominant_type, weather_factor, weather_rr, top_reasons, fixes, n_crashes, n_serious, n_fatal, n_killed,
      expected_serious, eb_estimate, excess, serious_per_km_year, st_asgeojson(geom)::json as geometry
    from api.segment_risk where seg_id = $1`, [id])
  if (!seg.rows.length) return res.status(404).json({ error: 'segment not found' })
  const [years, types, features, cmf, coverage] = await Promise.all([
    query(`select year, n_crashes, n_fatal, n_injury, n_damage, n_killed, n_injured, n_night, n_fog, n_rain, n_ice, n_wind
           from segment_year_stats where seg_id = $1 order by year`, [id]),
    query(`select type_group, count(*)::int as n, count(*) filter (where severity <> 'damage')::int as serious
           from crashes where seg_id = $1 and not in_settlement group by 1 order by 2 desc`, [id]),
    query(`select * from segment_features where seg_id = $1`, [id]),
    query(`select * from analysis.proactive where seg_id = $1`, [id]),
    query('select year, severity, coverage from crash_coverage order by 1, 2'),
  ])
  const { geometry, ...props } = seg.rows[0]
  const { seg_id: _a, road_class: _b, ...feat } = features.rows[0] ?? {}
  const { seg_id: _c, ...pro } = cmf.rows[0] ?? {}
  res.json(feature(geometry, {
    ...props,
    crashes_by_year: years.rows, crashes_by_type: types.rows, features: feat, proactive_elements: pro,
    note: '2025 covers 1 Jan - 13 Apr only. Crash counts are crashes with coordinates outside settlements; see crash_coverage.',
    crash_coverage: coverage.rows,
  }))
}))

api.get('/segments/:segId/crashes', wrap(async (req, res) => {
  const { rows } = await query(`select crash_id, ts_local, year, hour, type_group, type_raw, severity, n_killed, n_injured, is_night,
      in_settlement, wx_fog, wx_rain_heavy, wx_wind_strong, wx_ice, st_asgeojson(geom)::json as g
    from api.crashes where seg_id = $1 order by ts_local desc limit 1000`, [req.params.segId])
  res.json(collection(rows.map(({ g, ...p }) => feature(g, p))))
}))

api.get('/roads', wrap(async (req, res) => {
  const { rows } = await query(`select road, road_class, count(*)::int as segments, round(sum(length_m) / 1000, 1) as km,
      array_agg(distinct carriageway) as carriageways, round(avg(score)::numeric, 1) as avg_score,
      count(*) filter (where class >= 4)::int as class45_segments
    from api.segment_risk group by 1, 2
    order by array_position(array['A','I','II','III'], road_class), length(road), road`)
  res.set('Cache-Control', 'public, max-age=3600').json(rows)
}))

// km-by-km profile: one series per carriageway part (dual roads have one per direction)
api.get('/roads/:road/profile', wrap(async (req, res) => {
  const { rows } = await query(`select carriageway, part_no, piece_no, seg_id, km_from, km_to, in_settlement, settlement, oblast,
      class, score, reactive_pct, proactive_pct, proactive_s, n_serious, n_fatal, top_reasons -> 0 ->> 'key' as top_reason
    from api.segment_risk where road = $1 order by carriageway, part_no, piece_no`, [req.params.road])
  if (!rows.length) return res.status(404).json({ error: 'road not found' })
  const series = new Map()
  for (const { carriageway, part_no, piece_no: _p, ...r } of rows) {
    const key = `${carriageway}:${part_no}`
    if (!series.has(key)) series.set(key, { carriageway, part_no, km_total: 0, points: [] })
    const s = series.get(key)
    s.points.push(r)
    s.km_total = Math.max(s.km_total, r.km_to)
  }
  res.json({ road: req.params.road, note: 'km_from / km_to are km along the OSM line part, not official АПИ km posts',
    series: [...series.values()].sort((a, b) => b.points.length - a.points.length) })
}))

// "fix these first"
api.get('/priorities', wrap(async (req, res) => {
  const params = [int(req.query.limit, 50, 1, 500)]
  const where = ['priority_rank is not null']
  if (req.query.road_class) { params.push(String(req.query.road_class).split(',')); where.push(`road_class = any($${params.length})`) }
  if (req.query.oblast) { params.push(req.query.oblast); where.push(`oblast = $${params.length}`) }
  if (req.query.road) { params.push(req.query.road); where.push(`road = $${params.length}`) }
  const { rows } = await query(`select priority_rank, seg_id, road, road_class, oblast, municipality, km_from, km_to, class, priority,
      score, n_serious, n_fatal, expected_serious, excess, top_reasons, fixes,
      st_asgeojson(st_lineinterpolatepoint(st_linemerge(geom), 0.5))::json as center
    from api.segment_risk where ${where.join(' and ')} order by priority_rank limit $1`, params)
  res.json(rows)
}))

// crash points with the frontend's filters (for lists / small areas; the map uses the crash tiles)
api.get('/crashes', wrap(async (req, res) => {
  const b = bbox(req.query.bbox)
  if (!b) return bad(res, 'bbox=min_lon,min_lat,max_lon,max_lat is required')
  const params = [b[0], b[1], b[2], b[3], int(req.query.from, 2021, 2021, 2025), int(req.query.to, 2025, 2021, 2025), int(req.query.limit, 2000, 1, 10000)]
  const where = ['geom && st_makeenvelope($1, $2, $3, $4, 4326)', 'year between $5 and $6']
  if (req.query.severity) { params.push(String(req.query.severity).split(',')); where.push(`severity = any($${params.length})`) }
  if (req.query.type) { params.push(String(req.query.type).split(',')); where.push(`type_group = any($${params.length})`) }
  if (req.query.night === 'true' || req.query.night === 'false') { params.push(req.query.night === 'true'); where.push(`is_night = $${params.length}`) }
  const wx = { fog: 'wx_fog', rain: 'wx_rain_heavy', wind: 'wx_wind_strong', ice: 'wx_ice' }
  for (const k of String(req.query.weather ?? '').split(',').filter(Boolean)) {
    if (!wx[k]) return bad(res, 'weather must be fog, rain, wind or ice')
    where.push(`${wx[k]}`)
  }
  const { rows } = await query(`select crash_id, ts_local, year, hour, type_group, severity, n_killed, n_injured, is_night, seg_id,
      wx_fog, wx_rain_heavy, wx_wind_strong, wx_ice, st_asgeojson(geom)::json as g
    from api.crashes where ${where.join(' and ')} order by ts_local desc limit $7`, params)
  res.json(collection(rows.map(({ g, ...p }) => feature(g, p))))
}))

// ---- live layer (3-km sections) -------------------------------------------------------------------------------------
async function liveSections(heavy, road) {
  return cached(`live:${heavy}:${road ?? ''}`, road ? 30000 : 120000, async () => {
    const { rows } = await query(`select section_id, road, road_class, carriageway, km_from, km_to, oblast, base_score, base_score_max,
        base_class, conditions, multiplier, risk_now, road_status_score, road_status_level, access_status, events, warnings, weather,
        live_score, live_level, updated_at, st_asgeojson(geom, 6)::json as g
      from api.live_sections($1, $2)`, [heavy, road ?? null])
    return rows
  })
}

api.get('/live/sections', wrap(async (req, res) => {
  const vehicle = req.query.vehicle ?? 'car'
  if (!['car', 'heavy'].includes(vehicle)) return bad(res, 'vehicle must be car or heavy')
  const b = bbox(req.query.bbox)
  if (b === undefined) return bad(res, 'bbox must be min_lon,min_lat,max_lon,max_lat')
  let rows
  if (req.query.weight) {                       // a specific weight needs vlado's function on demand: road required
    if (!req.query.road) return bad(res, 'weight needs road')
    const w = Number(req.query.weight)
    if (!(w > 3.5)) return bad(res, 'weight must be > 3.5 (tonnes)')
    const r = await query(`select section_id, risk_score, risk_level, access_status, events from api.road_status_risk(true, $1, $2)`, [w, req.query.road])
    const byId = new Map(r.rows.map(x => [x.section_id, x]))
    rows = (await liveSections(true, req.query.road)).map(s => {
      const x = byId.get(s.section_id)
      return x ? { ...s, road_status_score: x.risk_score, road_status_level: x.risk_level, access_status: x.access_status, events: x.events } : s
    })
  } else {
    rows = await liveSections(vehicle === 'heavy', req.query.road)
  }
  if (b) rows = rows.filter(r => r.g?.coordinates?.some(([lon, lat]) => lon >= b[0] && lon <= b[2] && lat >= b[1] && lat <= b[3]))
  if (req.query.min_level) {
    const order = ['unknown', 'low', 'moderate', 'high', 'very_high', 'blocked']
    const min = order.indexOf(req.query.min_level)
    if (min < 0) return bad(res, 'min_level must be one of ' + order.join(', '))
    rows = rows.filter(r => order.indexOf(r.live_level) >= min)
  }
  res.set('Cache-Control', 'public, max-age=60').json(collection(rows.map(({ g, ...p }) => feature(g, p))))
}))

api.get('/live/events', wrap(async (req, res) => {
  const b = bbox(req.query.bbox)
  if (b === undefined) return bad(res, 'bbox must be min_lon,min_lat,max_lon,max_lat')
  const params = []
  const where = []
  if (b) { params.push(...b); where.push('geom && st_makeenvelope($1, $2, $3, $4, 4326)') }
  if (req.query.road) { params.push(req.query.road); where.push(`road = $${params.length}`) }
  const { rows } = await query(`select id, icon, feed, type, subtype, road, description, starts_at, ends_at,
      st_asgeojson(geom, 6)::json as g, ${req.query.full === 'true' ? 'st_asgeojson(geom_full, 6)::json' : 'null'} as line
    from api.live_events ${where.length ? 'where ' + where.join(' and ') : ''}`, params)
  res.set('Cache-Control', 'public, max-age=60').json(collection(rows.map(({ g, ...p }) => feature(g, p))))
}))

api.get('/live/warnings', wrap(async (req, res) => {
  const { rows } = await query(`select identifier, oblast, area, nuts3, event, awareness_type, condition, level, severity, onset, expires, title
    from live.warnings_now order by oblast, level desc`)
  res.set('Cache-Control', 'public, max-age=60').json(rows)
}))

api.get('/live/weather', wrap(async (req, res) => {
  const { rows } = await query(`select c.*, st_asgeojson(st_point(w.lon, w.lat, 4326))::json as g
    from live.cell_conditions c join weather_cells_needed w using (wx_cell_id)`)
  res.set('Cache-Control', 'public, max-age=60').json(collection(rows.map(({ g, ...p }) => feature(g, p))))
}))

api.get('/live/status', wrap(async (req, res) => {
  const { rows } = await query(`select feed, last_ok, last_error, error, rows,
      extract(epoch from now() - last_ok)::int as age_s from live.feed_status order by feed`)
  res.json(rows)
}))

// ---- summary numbers for the landing page ----------------------------------------------------------------------------
api.get('/stats/summary', wrap(async (req, res) => {
  const { rows } = await query(`select
      (select count(*) from crashes)::int as crashes_total,
      (select count(*) from crashes where seg_id is not null and not in_settlement)::int as crashes_on_network,
      (select count(*) from crashes where seg_id is not null and not in_settlement and severity = 'fatal')::int as fatal_on_network,
      (select count(*) from segments)::int as segments,
      (select round(sum(length_m) / 1000) from segments) as network_km,
      (select count(*) from analysis.segment_scores where class = 5)::int as class5_segments,
      (select json_object_agg(metric, value) from analysis.validation) as validation`)
  res.set('Cache-Control', 'public, max-age=3600').json(rows[0])
}))

api.use(routeRouter)               // POST /api/route (docs/route-api.md)
app.use('/api', api)
app.use((req, res) => res.status(404).json({ error: 'not found' }))
app.use((err, req, res, _next) => {
  console.error(err)
  res.status(500).json({ error: 'internal error' })
})

// keep the network-wide live map warm: at start and after every poll
const warm = () => Promise.all([liveSections(false), liveSections(true)].map(p => p.catch(e => console.error('[warm]', e.message))))
const expireLive = () => { for (const [k, v] of cache) if (k.startsWith('live:')) v.until = 0; warm() }

const port = int(env('PORT'), 8787, 1, 65535)
const server = app.listen(port, () => { console.log(`SafetyCar API on http://localhost:${port}/api`); warm() })
if (env('LIVE_POLL') === '1') startPolling(expireLive)

const stop = () => server.close(() => pool.end().then(() => process.exit(0)))
process.on('SIGTERM', stop)
process.on('SIGINT', stop)
