# Backend setup on wp-host (for the DB/server owner)

What is new: an **analysis** step (Python) that writes scores into the database, and an **API server** (Node) with
live-data pollers. Endpoints for the frontend: `docs/api.md`. Development so far ran against a local copy of the
database; nothing below has been run on `wp-host` yet.

## What it adds to the database

| Schema / object | Created by | Owner needs |
|---|---|---|
| `analysis.*` (reactive, proactive, weather_rr, segment_weather, weights, segment_scores, validation) | `analysis/run.py` | create schema, drop/create tables in `analysis` |
| `api.segment_risk`, `api.segment_risk_mvt()`, `api.weather_multipliers` | `analysis/sql/api_risk.sql` (run by `run.py`) | create in `api` |
| `public.road_status_snapshot`, `api.road_status_risk()` | `road-status-queries/install.sql` (vlado) | as above |
| `live.*` (weather, station, traffic, warnings, road_status_sections, feed_status, nuts3_oblast + views), `api.live_sections()`, `api.live_events` | `backend/sql/live.sql` | create schema `live`, insert into its tables |

Nothing in `public` from `db/01-09` is changed. Every script grants read access to `safetycar_ro` when that role exists.

## Steps (as the `safetycar` user, in the repo checkout)

```bash
# 1. analysis (Python 3.11+; ~20 s)
python3 -m venv .venv && .venv/bin/pip install -r analysis/requirements.txt
DATABASE_URL=postgresql://safetycar@localhost/safetycar .venv/bin/python analysis/run.py

# 2. backend + live schema (Node 20+)
cd backend && npm ci
DATABASE_URL=postgresql://safetycar@localhost/safetycar npm run setup-db
DATABASE_URL=postgresql://safetycar@localhost/safetycar npm run poll     # fills the live tables once (~30 s)
```

Add to `/data/home/safetycar/backend.env` (the file `docs/database.md` describes):

```
DATABASE_URL=...safetycar_ro...           # already there: the API only reads
DATABASE_URL_WRITE=...safetycar...        # NEW: the pollers write schema live
PORT=8787
LIVE_POLL=1                               # pollers run inside the API process
CORS_ORIGIN=https://safetycar.invent2025.org
```

## Run it as a service

`/etc/systemd/system/safetycar-api.service`:

```ini
[Unit]
Description=SafetyCar API
After=network-online.target postgresql.service

[Service]
User=safetycar
WorkingDirectory=/data/home/safetycar/SafetyCar/backend
EnvironmentFile=/data/home/safetycar/backend.env
ExecStart=/usr/bin/node src/server.mjs
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

`sudo systemctl enable --now safetycar-api`, then `curl localhost:8787/api/health`.

## Apache: send `/api` to the Node process

`ProxyPass` is not allowed in `.htaccess`, so this goes into the virtual host of `safetycar.invent2025.org` (Virtualmin
→ Edit Directives), with `mod_proxy` and `mod_proxy_http` enabled:

```apache
ProxyPreserveHost On
ProxyPass        /api http://127.0.0.1:8787/api
ProxyPassReverse /api http://127.0.0.1:8787/api
```

`scripts/deploy.sh` replaces `public_html` and its `.htaccess`. The proxy lives in the vhost, so deploys don't touch it.

## After new data

- New crashes, segments or weather (`db/run_all.sh`) → run `analysis/run.py` again. Tables whose columns did not
  change are refilled in place (the API keeps working; requests wait a moment instead of failing). If columns
  changed, the views are re-created at the end, together with `backend/sql/live.sql` when the live layer is
  installed. The API's live cache expires within 2 min.
- New or changed segments → also `npm run setup-db` (rebuilds `live.section_geo`, the static 3-km section table).
- Changed `backend/sql/live.sql` → `npm run setup-db`.
- After pulling this version: `npm run setup-db` once (new tables `live.section_geo`, `live.section_station`,
  new column `weather_status`), then restart the API. Nationwide `/api/live/sections` drops from > 30 s (timeout)
  on the server to ~0.5 s locally.

## Database improvements (suggestions, none blocks the demo)

1. **Weather history for all crash years** (now 2023-04 … 2025-04) and **finer cells** (0.25° instead of 1°). The fog
   and rain multipliers rest on 971 / 193 crashes. More years means more reliable numbers, and finer cells would help
   in the mountains.
2. **Keep the logged live data.** `live.traffic` grows ~37k rows/day. That's fine, it is the only way to get traffic
   volumes per road later (none in the open data). If space matters, delete rows older than 90 days; never truncate.
3. `db/04_segments.sql` line 5 says `km_from` / `km_to` are metres; the values are km. Only the comment is wrong.
4. 2 segments have a `wx_cell_id` without weather rows, and 47 located crashes have no oblast. Harmless; listed in
   case `03`/`07a` are touched anyway.
5. Optional speed-up: `api.live_sections()` over the whole network takes ~3 s and `api.road_status_risk()` ~6 s.
   Both are cached (in the API and in `live.road_status_sections`), so this only matters if they're called elsewhere.

## Local development note

The local Docker database (`postgis/postgis` image) has a 64 MB `/dev/shm` by default. Under heavy parallel load,
PostgreSQL's parallel queries then fail with `could not resize shared memory segment ... No space left on device`.
Start the container with `--shm-size=512m` (or `shm_size: 512m` in compose). The server installation is not affected.
