// Live feeds -> schema live. Every function fetches once, writes, and returns the number of rows written.
// Sources and fields: docs/realtime-data.md. All feed times are UTC.
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { writePool, root_dir } from '../db.mjs'

const UA = { 'User-Agent': 'safetycar-hackathon/0.1' }

async function getJson(url, headers = {}) {
  const r = await fetch(url, { headers: { ...UA, ...headers }, signal: AbortSignal.timeout(30000) })
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`)
  const text = await r.text()
  return JSON.parse(text.replace(/^﻿/, ''))     // bgtoll answers with a UTF-8 BOM
}

const utc = s => (s ? new Date(s.replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? '' : 'Z')) : null)
const num = v => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v))

// 1. Open-Meteo: current weather at the weather-cell centres (one request for all ~24 cells)
export async function openMeteo() {
  const { rows: cells } = await writePool.query('select wx_cell_id, lat, lon from weather_cells_needed order by 1')
  const vars = 'temperature_2m,dew_point_2m,relative_humidity_2m,precipitation,rain,snowfall,weather_code,' +
    'cloud_cover,cloud_cover_low,visibility,wind_gusts_10m,is_day'
  const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + cells.map(c => c.lat).join(',') +
    '&longitude=' + cells.map(c => c.lon).join(',') + `&current=${vars}&hourly=precipitation&past_hours=6&forecast_hours=1&timezone=UTC`
  const data = await getJson(url)
  const list = Array.isArray(data) ? data : [data]
  const fetched = new Date()
  let n = 0
  for (const [i, d] of list.entries()) {
    const c = d.current
    const hours = d.hourly.time.map((t, k) => [t, d.hourly.precipitation[k]]).filter(([t]) => t <= c.time.slice(0, 13) + ':00')
    const last6 = hours.slice(-6).map(([, p]) => p ?? 0)
    await writePool.query(
      `insert into live.weather (wx_cell_id, fetched_at, ts_utc, temperature_2m, dew_point_2m, relative_humidity_2m,
         precipitation, precip_1h, precip_6h, rain, snowfall, weather_code, cloud_cover, cloud_cover_low, visibility,
         wind_gusts_10m, is_day)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) on conflict do nothing`,
      [cells[i].wx_cell_id, fetched, utc(c.time), c.temperature_2m, c.dew_point_2m, c.relative_humidity_2m,
        c.precipitation, hours.at(-1)?.[1] ?? null, last6.reduce((a, b) => a + b, 0), c.rain, c.snowfall,
        c.weather_code, c.cloud_cover, c.cloud_cover_low, c.visibility, c.wind_gusts_10m, c.is_day === 1])
    n++
  }
  return n
}

// 2. bgtoll.bg toll counters (undocumented JSON behind bgtoll.bg/traffic_passes; their page polls every 20 min)
export async function bgtollTraffic() {
  const data = await getJson('https://bgtoll.bg/index.php/traffic_passes/data', { Referer: 'https://bgtoll.bg/traffic_passes' })
  const fetched = new Date()
  const heavyKeys = ['class3_heavy_12t', 'class4_heavy_2a', 'class5_heavy_3a', 'class6_heavy_4a', 'class7_heavy_5a', 'class9_bus_heavy']
  let n = 0
  for (const p of data) {
    const heavy = heavyKeys.reduce((a, k) => a + (num(p.classes1Hour?.[k]) ?? 0), 0)
    const count = num(p.count1Hour)
    const r = await writePool.query(
      `insert into live.traffic values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) on conflict do nothing`,
      [p.scp, utc(p.time), fetched, p.name, num(p.lat), num(p.lon), num(p.count15min), count,
        num(p.average_speed_1Hour), heavy, count ? heavy / count : null])
    n += r.rowCount
  }
  return n
}

// 3. bgtoll.bg road weather stations: current readings + the site's own station-vs-model check
export async function bgtollStations() {
  const ref = { Referer: 'https://bgtoll.bg/mto' }
  const [data, check] = await Promise.all([
    getJson('https://bgtoll.bg/index.php/mto/data', ref),
    getJson('https://bgtoll.bg/index.php/mto/temperaturefallback', ref).catch(() => ({})),
  ])
  const fetched = new Date()
  let n = 0
  for (const s of data) {
    const c = check[String(s.station_id)] ?? {}
    const r = await writePool.query(
      `insert into live.station values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) on conflict do nothing`,
      [s.station_id, utc(s.time), fetched, s.name, num(s.lat), num(s.lon), num(s.air), num(s.surface),
        num(s.humidity), num(s.wind), c.use_model ?? null, c.status ?? null])
    n += r.rowCount
  }
  // nearest station per 3-km section (stations rarely move; cheap, and keeps api.live_sections fast)
  await writePool.query('select live.refresh_section_station()')
    .catch(e => console.error(`[live] refresh_section_station: ${e.message} (run npm run setup-db)`))
  return n
}

// 4. MeteoAlarm warnings for Bulgaria (Atom + CAP fields, parsed without an XML library)
export async function meteoAlarm() {
  const r = await fetch('https://feeds.meteoalarm.org/feeds/meteoalarm-legacy-atom-bulgaria',
    { headers: UA, signal: AbortSignal.timeout(30000) })
  if (!r.ok) throw new Error(`meteoalarm: HTTP ${r.status}`)
  const xml = await r.text()
  const tag = (e, t) => (e.match(new RegExp(`<${t}[^>]*>([^<]*)</${t}>`)) ?? [])[1] ?? null
  const fetched = new Date()
  let n = 0
  for (const e of xml.split('<entry>').slice(1)) {
    const title = tag(e, 'title')
    const m = /^(Yellow|Orange|Red)\s+(.+?)\s+Warning/i.exec(title ?? '')
    const nuts3 = (e.match(/<value>(BG\d+)<\/value>/) ?? [])[1] ?? null
    // one CAP alert covers several oblasts under the same identifier -> one row per (alert, area)
    const r2 = await writePool.query(
      `insert into live.warnings values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       on conflict (identifier) do update set fetched_at = excluded.fetched_at, expires = excluded.expires,
         severity = excluded.severity, level = excluded.level, title = excluded.title`,
      [`${tag(e, 'cap:identifier')}:${nuts3}`, fetched, nuts3, tag(e, 'cap:areaDesc'),
        tag(e, 'cap:event'), m?.[2]?.toLowerCase() ?? null, m?.[1]?.toLowerCase() ?? null, tag(e, 'cap:severity'),
        tag(e, 'cap:onset'), tag(e, 'cap:expires'), title])
    n += r2.rowCount
  }
  return n
}

// 5. АПИ road events: vlado's road-status-queries/fetch.mjs prints one atomic upsert; then the network-wide
//    scores per 3-km section are stored for cars and heavy vehicles (api.road_status_risk takes ~6 s each).
export async function apiRoadStatus() {
  const sql = await new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [join(root_dir, 'road-status-queries', 'fetch.mjs')], { stdio: ['ignore', 'pipe', 'pipe'] })
    const out = [], err = []
    p.stdout.on('data', d => out.push(d))
    p.stderr.on('data', d => err.push(d))
    p.on('close', code => (code === 0 ? resolve(Buffer.concat(out).toString()) : reject(new Error(Buffer.concat(err).toString().trim()))))
  })
  await writePool.query(sql)
  const client = await writePool.connect()
  try {
    await client.query('begin')
    await client.query('delete from live.road_status_sections')
    for (const [vehicle, heavy] of [['car', false], ['heavy', true]]) {
      await client.query(
        `insert into live.road_status_sections
         select $1, section_id, road, carriageway, km_from, km_to, risk_score, risk_level, access_status,
                oldest_publication_at, events, now()
         from api.road_status_risk($2, null, null)`, [vehicle, heavy])
    }
    await client.query('commit')
  } catch (e) {
    await client.query('rollback')
    throw e
  } finally {
    client.release()
  }
  const { rows } = await writePool.query(`select count(*)::int n from live.road_status_sections where risk_score > 0`)
  return rows[0].n
}

export const FEEDS = {
  open_meteo: { run: openMeteo, everyMin: 15 },
  bgtoll_traffic: { run: bgtollTraffic, everyMin: 20 },
  bgtoll_stations: { run: bgtollStations, everyMin: 15 },
  meteoalarm: { run: meteoAlarm, everyMin: 15 },
  api_road_status: { run: apiRoadStatus, everyMin: 15 },
}
