// One-time / after-update DB setup for the live layer (needs a role that may create schemas):
//   1. road-status-queries/install.sql (vlado: АПИ snapshot table + api.road_status_risk)
//   2. backend/sql/live.sql             (schema live, api.live_sections, api.live_events)
// The analysis (schema analysis + api.segment_risk) is created by: .venv/bin/python analysis/run.py
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { writePool, root_dir } from './db.mjs'

const files = [join(root_dir, 'road-status-queries', 'install.sql'), join(root_dir, 'backend', 'sql', 'live.sql')]
const { rows } = await writePool.query("select to_regclass('analysis.segment_scores') is not null as ok")
if (!rows[0].ok) {
  console.error('schema analysis is missing: run `.venv/bin/python analysis/run.py` first')
  process.exit(1)
}
for (const f of files) {
  const sql = readFileSync(f, 'utf8').replace(/^\\set .*$/gm, '')     // psql meta-commands
  await writePool.query(sql)
  console.log('applied', f.slice(root_dir.length + 1))
}
await writePool.end()
