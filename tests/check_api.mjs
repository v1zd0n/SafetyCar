// Every API endpoint with valid and invalid input.
//   node tests/check_api.mjs [base-url]        default http://localhost:8787/api (or API_URL)
// Read-only: safe against the production API too (only GETs, one POST that is rejected before any work).
const B = (process.argv[2] ?? process.env.API_URL ?? 'http://localhost:8787/api').replace(/\/$/, '')
const R = []

async function t(name, path, expect, check, init) {
  const t0 = Date.now()
  let status, body, err
  try {
    const r = await fetch(B + path, { signal: AbortSignal.timeout(60000), ...init })
    status = r.status
    const ct = r.headers.get('content-type') ?? ''
    body = ct.includes('json') ? await r.json() : Buffer.from(await r.arrayBuffer())
  } catch (e) { err = e.message }
  let ok = !err && (Array.isArray(expect) ? expect.includes(status) : status === expect)
  let note = err ?? ''
  if (ok && check) {
    try { const c = check(body); if (c !== true) { ok = false; note = String(c) } } catch (e) { ok = false; note = 'check threw ' + e.message }
  }
  R.push([ok ? 'PASS' : 'FAIL', name, status, Date.now() - t0, note])
  return body
}
const fc = b => b.type === 'FeatureCollection' || 'not a FeatureCollection'
const enc = encodeURIComponent

// a real segment id from the data, so the checks do not depend on one dataset
const first = await t('priorities default (first 50, rank 1 first)', '/priorities', 200,
  b => (b.length === 50 && b[0].priority_rank === 1) || 'bad order')
const segId = first?.[0]?.seg_id ?? 'I-5:s14:001'

// tiles
await t('risk tile z7', '/tiles/risk/7/72/47.pbf', 200, b => b.length > 1000 || 'tiny tile')
await t('risk tile outside Bulgaria is empty', '/tiles/risk/10/0/0.pbf', 200, b => b.length === 0 || 'expected empty')
await t('risk tile non-numeric z -> 400', '/tiles/risk/abc/1/1.pbf', 400)
await t('risk tile negative x -> 400', '/tiles/risk/5/-1/3.pbf', 400)
await t('risk tile z=99 -> 400', '/tiles/risk/99/1/1.pbf', 400)
await t('risk tile x out of range for z -> 400', '/tiles/risk/3/100/1.pbf', 400)
await t('crash tile, years reversed', '/tiles/crashes/10/586/382.pbf?from=2025&to=2021', [200, 400])
await t('crash tile, junk year falls back to default', '/tiles/crashes/10/586/382.pbf?from=abc', 200)
await t('crash tile invalid y -> 400', '/tiles/crashes/4/1/16.pbf', 400)

// segments
await t('segment card has reasons and 5 years of history', '/segments/' + enc(segId), 200,
  b => (b.properties.top_reasons.length > 0 && b.properties.crashes_by_year.length === 5) || 'missing fields')
await t('unknown segment -> 404', '/segments/XX', 404)
await t('SQL-injection-like id -> 404', '/segments/' + enc("'; drop table x;--"), 404)
await t('Cyrillic id -> 404', '/segments/' + enc('Ямбол'), 404)
await t('crashes of an unknown segment -> empty', '/segments/XX/crashes', [200, 404], b => (b.features?.length === 0) || 'should be empty')
await t('crashes of a segment', '/segments/' + enc(segId) + '/crashes', 200, fc)

// roads
await t('road list', '/roads', 200, b => b.length > 400 || 'few roads')
await t('A1 profile has one series per direction', '/roads/A1/profile', 200, b => b.series.length === 2 || 'expected 2 series')
await t('unknown road profile -> 404', '/roads/ZZZ/profile', 404)

// priorities
await t('priorities limit=0 clamps to 1', '/priorities?limit=0', 200, b => b.length === 1 || `len ${b.length}`)
await t('priorities limit=99999 clamps to 500', '/priorities?limit=99999', 200, b => b.length === 500 || `len ${b.length}`)
await t('priorities limit=abc -> default 50', '/priorities?limit=abc', 200, b => b.length === 50 || `len ${b.length}`)
await t('priorities road_class filter', '/priorities?road_class=A', 200, b => b.every(x => x.road_class === 'A') || 'filter broken')
await t('priorities oblast filter (Cyrillic)', '/priorities?oblast=' + enc('Ямбол'), 200, b => b.every(x => x.oblast === 'Ямбол') || 'filter broken')
await t('priorities unknown oblast -> empty', '/priorities?oblast=Mars', 200, b => b.length === 0 || 'not empty')

// crashes
await t('crashes without bbox -> 400', '/crashes', 400)
await t('crashes bbox with 3 numbers -> 400', '/crashes?bbox=1,2,3', 400)
await t('crashes bbox not numbers -> 400', '/crashes?bbox=a,b,c,d', 400)
await t('crashes fog filter', '/crashes?bbox=22,41,29,44.3&weather=fog&limit=50', 200, b => b.features.every(f => f.properties.wx_fog === true) || 'not all fog')
await t('crashes unknown weather -> 400', '/crashes?bbox=22,41,29,44.3&weather=snow', 400)
await t('crashes night=false', '/crashes?bbox=22,41,29,44.3&night=false&limit=50', 200, b => b.features.every(f => f.properties.is_night === false) || 'night filter')
await t('crashes severity filter', '/crashes?bbox=22,41,29,44.3&severity=fatal&limit=50', 200, b => b.features.every(f => f.properties.severity === 'fatal') || 'severity filter')
await t('crashes unknown severity -> empty', '/crashes?bbox=22,41,29,44.3&severity=xyz', [200, 400], b => (b.features ? b.features.length === 0 || 'junk matched' : true))
await t('crashes whole country, limit 10000', '/crashes?bbox=22,41,29,44.3&limit=10000', 200, b => b.features.length === 10000 || b.features.length)

// live
await t('live A1, every section has weather_status', '/live/sections?road=A1', 200,
  b => (b.type === 'FeatureCollection' && b.features.every(f => ['ok', 'stale', 'missing'].includes(f.properties.weather_status))) || 'weather_status missing')
await t('live whole network (cached)', '/live/sections?min_level=very_high', 200, fc)
await t('live bbox', '/live/sections?bbox=26.3,42.3,26.8,42.6', 200, fc)
await t('live min_level=high filter', '/live/sections?road=A1&min_level=high', 200,
  b => b.features.every(f => ['high', 'very_high', 'blocked'].includes(f.properties.live_level)) || 'level filter')
await t('live unknown min_level -> 400 (before any query)', '/live/sections?min_level=foo', 400)
await t('live unknown vehicle -> 400', '/live/sections?vehicle=bus', 400)
await t('live weight without road -> 400', '/live/sections?weight=18', 400)
await t('live weight 3 t -> 400', '/live/sections?road=A1&weight=3', 400)
await t('live weight not a number -> 400', '/live/sections?road=A1&weight=abc', 400)
await t('live weight 1e9 -> 400', '/live/sections?road=A1&weight=1e9', 400)
await t('live road given twice -> 400', '/live/sections?road=A1&road=A2', 400)
await t('live weight 18 t on A1', '/live/sections?road=A1&weight=18', 200, fc)
await t('live unknown road -> empty', '/live/sections?road=NOPE', 200, b => b.features.length === 0 || 'not empty')
await t('live bad bbox -> 400', '/live/sections?bbox=1,2', 400)
await t('live events', '/live/events?road=A1', 200, fc)
await t('live events with full lines', '/live/events?road=A1&full=true', 200, b => b.features.every(f => f.properties.line) || 'no line')
await t('live warnings', '/live/warnings', 200, b => Array.isArray(b) || 'not an array')
await t('live weather', '/live/weather', 200, fc)
await t('live feed status', '/live/status', 200, b => Array.isArray(b) || 'not an array')

// meta, misc
await t('meta has validation numbers', '/meta', 200, b => b.validation.length > 10 || 'no validation')
await t('summary', '/stats/summary', 200)
await t('health', '/health', 200, b => b.ok === true || 'not ok')
await t('unknown path -> 404', '/nope', 404)
await t('GET /route -> 404', '/route', [404, 405])
await t('POST /route with malformed JSON -> 400', '/route', 400, null,
  { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: 'not json' })

for (const [s, n, st, ms, note] of R) console.log(`${s}  ${String(st).padEnd(4)} ${String(ms).padStart(5)} ms  ${n}${note ? '   [' + note + ']' : ''}`)
const failed = R.filter(r => r[0] === 'FAIL').length
console.log(`api (${B}): ${R.length - failed} / ${R.length} passed`)
process.exitCode = failed ? 1 : 0
