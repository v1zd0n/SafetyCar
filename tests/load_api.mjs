// Diagnostic: bursts of parallel requests against a running API; prints failures per burst.
//   node tests/load_api.mjs [base-url]        default http://localhost:8787/api
// Do not point this at production during the demo.
const B = (process.argv[2] ?? process.env.API_URL ?? 'http://localhost:8787/api').replace(/\/$/, '')

async function burst(label, paths, n) {
  const t = Date.now()
  const rs = await Promise.all(Array.from({ length: n }, (_, i) =>
    fetch(B + paths[i % paths.length]).then(r => r.status).catch(() => 'ERR')))
  const bad = rs.filter(s => s !== 200)
  console.log(`${label.padEnd(40)} ${n} requests in ${Date.now() - t} ms, failed: ${bad.length}${bad.length ? ' ' + JSON.stringify(bad) : ''}`)
  return bad.length
}

const ids = (await fetch(B + '/priorities?limit=20').then(r => r.json())).map(p => p.seg_id)
let failed = 0
failed += await burst('segment cards', ids.map(id => '/segments/' + encodeURIComponent(id)), 100)
failed += await burst('risk tiles z10', Array.from({ length: 20 }, (_, i) => `/tiles/risk/10/${580 + i % 10}/${380 + Math.floor(i / 10)}.pbf`), 100)
failed += await burst('live whole network (cached)', ['/live/sections?min_level=very_high'], 30)
failed += await burst('live per road (uncached)', ['A1', 'A2', 'I-1', 'I-5', 'II-86', 'III-197', 'I-9', 'A4'].map(r => `/live/sections?road=${r}`), 40)
failed += await burst('priorities + road profile', ['/priorities?limit=200', '/roads/I-1/profile'], 40)
failed += await burst('130 different unknown roads (cache cap)', Array.from({ length: 130 }, (_, i) => `/live/sections?road=X${i}`), 130)
const health = await fetch(B + '/health').then(r => r.json()).catch(() => ({}))
console.log(`health afterwards: ${health.ok === true ? 'ok' : 'NOT OK'}; failed requests: ${failed}`)
process.exitCode = failed || health.ok !== true ? 1 : 0
