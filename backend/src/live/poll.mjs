// Runs the live feeds. Two ways:
//   node src/live/poll.mjs once        run every feed once and exit (for cron / systemd timer)
//   startPolling()                     from server.mjs when LIVE_POLL=1: each feed on its own interval
// A failed feed keeps the last good rows (the views only look at recent ones) and records the error.
import { pathToFileURL } from 'node:url'
import { FEEDS } from './feeds.mjs'
import { writePool } from '../db.mjs'

async function record(feed, ok, rows, error) {
  await writePool.query(
    `insert into live.feed_status (feed, last_ok, last_error, error, rows) values ($1, $2, $3, $4, $5)
     on conflict (feed) do update set
       last_ok = coalesce(excluded.last_ok, live.feed_status.last_ok),
       last_error = coalesce(excluded.last_error, live.feed_status.last_error),
       error = excluded.error, rows = coalesce(excluded.rows, live.feed_status.rows)`,
    [feed, ok ? new Date() : null, ok ? null : new Date(), error ?? null, rows ?? null]).catch(() => {})
}

export async function runFeed(name, onDone) {
  const t = Date.now()
  try {
    const rows = await FEEDS[name].run()
    await record(name, true, rows)
    console.log(`[live] ${name}: ${rows} rows in ${((Date.now() - t) / 1000).toFixed(1)} s`)
    onDone?.(name)
    return true
  } catch (e) {
    await record(name, false, null, String(e.message ?? e).slice(0, 500))
    console.error(`[live] ${name} failed: ${e.message ?? e}`)
    return false
  }
}

export function startPolling(onDone) {
  let delay = 0
  for (const [name, feed] of Object.entries(FEEDS)) {
    setTimeout(() => {                          // stagger the first runs a little
      runFeed(name, onDone)
      setInterval(() => runFeed(name, onDone), feed.everyMin * 60 * 1000).unref()
    }, delay).unref()
    delay += 3000
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const names = process.argv.slice(3).length ? process.argv.slice(3) : Object.keys(FEEDS)
  const results = []
  for (const name of names) results.push(await runFeed(name))
  await writePool.end()
  process.exitCode = results.every(Boolean) ? 0 : 1
}
