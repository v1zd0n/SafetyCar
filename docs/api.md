# SafetyCar API: endpoints for the frontend

The API (`backend/`, Node + Express) serves road and route data from the PostGIS database.
All responses are JSON or Mapbox vector tiles, all coordinates are WGS 84 (lon, lat), all times are UTC (ISO 8601).

| | Base URL |
|---|---|
| Local | `http://localhost:8787/api` (start it: `cd backend && npm install && npm start`) |
| Server | `https://safetycar.invent2025.org/api`, once the Apache proxy is set up (`docs/backend-setup.md`) |

Set `VITE_ROUTE_API_URL=http://localhost:8787/api/route` for local development with the backend running. In production, use `/api/route` if the site and API share an origin through the Apache proxy.

The Bulgarian route demo uses `GET /places` and `POST /route` when configured, as described in [the route API guide](route-api.md). The landing page uses a sample heatmap and bundled casualty totals.

---

## Backend endpoints for future UI integrations

| UI part | Endpoint |
|---|---|
| Risk map (1-km segments, coloured) | `GET /tiles/risk/{z}/{x}/{y}.pbf` |
| Weight sliders (reactive vs proactive) | client-side, from the tile properties (see below) |
| Crash points + filters (year, type, severity, night, fog/rain) | `GET /tiles/crashes/{z}/{x}/{y}.pbf` + Mapbox filters |
| Click on a segment: stats, top 3 reasons, fixes | `GET /segments/{seg_id}` |
| Crash list for a segment | `GET /segments/{seg_id}/crashes` |
| Km-by-km road profile chart | `GET /roads/{road}/profile` |
| Road picker | `GET /roads` |
| "Fix these first" list | `GET /priorities` |
| Live "risk now" layer (3-km sections) | `GET /live/sections` |
| Live event icons (accidents, roadworks, closures …) | `GET /live/events` |
| Weather warnings banner | `GET /live/warnings` |
| Current weather per area | `GET /live/weather` |
| "Updated x min ago" | `GET /live/status` |
| Landing page counters | `GET /stats/summary` |
| Legends, data period, weights, validation numbers | `GET /meta` |

---

## 1. Risk map: `GET /tiles/risk/{z}/{x}/{y}.pbf`

Mapbox vector tile, source layer **`risk`**, one line per ~1-km segment. Thinned by zoom: z < 7 only A and I roads,
z < 9 also II, z ≥ 9 everything. Empty tile = valid response. Invalid coordinates (not integers, z > 22, x or y ≥ 2^z) → `400`.

| Property | Type | Meaning |
|---|---|---|
| `seg_id` | text | e.g. `I-5:s14:001`. Use it for `/segments/{seg_id}` |
| `road`, `road_class` | text | `A1`, `I-5` … / `A`, `I`, `II`, `III` |
| `carriageway` | text | `single` or `dual` (dual roads have one line per direction) |
| `in_settlement` | bool | mostly inside a town or village. **Not assessed** (ДАБДП method): `class` and `score` are null → draw grey |
| `class` | int 1–5 | ДАБДП class: 1 very low … 5 very high priority. **Default colouring** |
| `score` | 0–100 | continuous score with the default weights (0.6 reactive + 0.4 proactive) |
| `reactive_pct`, `proactive_pct` | 0–100 | the two parts of the score, for the sliders |
| `reactive_level` | text | `high`, `uncertain`, `low`, `not_assessed`. `high` needs ≥ 3 serious crashes; 1–2 crashes stay `uncertain` (sparse evidence) |
| `proactive_level` | text | `high`, `medium`, `low` |
| `n_serious`, `n_fatal` | int | serious / fatal crashes 2021–2024 |
| `top_reason` | text | key of the first reason (see §11) |

```js
map.addSource('risk', { type: 'vector', tiles: [`${API}/tiles/risk/{z}/{x}/{y}.pbf`], minzoom: 5, maxzoom: 14 })
map.addLayer({ id: 'risk', type: 'line', source: 'risk', 'source-layer': 'risk',
  paint: { 'line-width': ['interpolate', ['linear'], ['zoom'], 6, 1.5, 12, 4],
    'line-color': ['match', ['coalesce', ['get', 'class'], 0],
      1, '#3DDC97', 2, '#A3E36B', 3, '#FFC53D', 4, '#FF5A1F', 5, '#E5212E', /* not assessed */ '#5C5C66'] } })
```

**Sliders.** The score is `w_r × reactive_pct + w_p × proactive_pct` (defaults 0.6 / 0.4, sum = 1). Recompute in the
style without new requests:

```js
const scoreExpr = (wr) => ['+', ['*', wr, ['get', 'reactive_pct']], ['*', 1 - wr, ['get', 'proactive_pct']]]
map.setPaintProperty('risk', 'line-color', ['case', ['==', ['get', 'score'], null], '#5C5C66',
  ['interpolate', ['linear'], scoreExpr(wr), 0, '#3DDC97', 50, '#FFC53D', 80, '#FF5A1F', 95, '#E5212E']])
```

## 2. Crash points: `GET /tiles/crashes/{z}/{x}/{y}.pbf?from=2021&to=2025`

Source layer **`crashes`**, crashes on the national network only. Damage-only crashes appear from z ≥ 10.

Properties: `crash_id, year, hour, type_group, severity` (`fatal`/`injury`/`damage`), `is_night, in_settlement,
wx_fog, wx_rain_heavy, wx_wind_strong, wx_ice` (weather flags exist only for 2023-04-14 … 2025-04-13, otherwise null).

All filters work client-side with Mapbox filter expressions:

```js
map.setFilter('crashes', ['all',
  ['>=', ['get', 'year'], 2023],
  ['in', ['get', 'severity'], ['literal', ['fatal', 'injury']]],
  ['in', ['get', 'type_group'], ['literal', ['rear_end', 'head_on']]],
  ['==', ['get', 'is_night'], true],
  ['==', ['get', 'wx_fog'], true]])
```

`type_group` values: `rear_end, side, angle, head_on, run_off_road, rollover, pedestrian, cyclist, parked, animal_cart,
obstacle, train, other`.

## 3. Segment card: `GET /segments/{seg_id}`

GeoJSON Feature (the segment line). `properties`:

| Field | Meaning |
|---|---|
| `road, road_class, carriageway, km_from, km_to, length_m, oblast, municipality, settlement, in_settlement` | location. km are along the OSM line, **not** official АПИ km posts |
| `assessed` | false inside settlements (no class / score) |
| `class`, `priority` | 1–5 / `very_low` … `very_high` |
| `score`, `priority_rank` | 0–100 / position in the "fix these first" list (1 = first) |
| `reactive_level, reactive_pct, proactive_level, proactive_s, proactive_pct` | the two assessments. `proactive_s` is the ДАБДП safety score (100 = safe; < 50 high risk) |
| `n_crashes, n_serious, n_fatal, n_killed` | 2021–2024, outside settlements |
| `expected_serious`, `excess` | serious crashes expected for this road class / estimated excess |
| `top_reasons` | up to 3 objects `{key, source, bg, en, detail, strength, estimated}`. `source` ∈ `road`, `crashes`, `weather`. `estimated: true` = based only on a road-class default, show it in a lighter style or with "(оценка)" |
| `fixes` | list `{reason, bg, en, basis, cost}`. `basis` = `dabdp` (from the ДАБДП report) or `project` (our proposal). `cost` = `low`, `medium`, `high` |
| `dominant_type`, `weather_factor`, `weather_rr` | over-represented crash type / weather condition with more crashes than normal and how many times more |
| `crashes_by_year` | `[{year, n_crashes, n_fatal, n_injury, n_damage, n_killed, n_injured, n_night, n_fog, n_rain, n_ice, n_wind}]`, 2021–2025. **2025 = 1 Jan–13 Apr only** |
| `crashes_by_type` | `[{type_group, n, serious}]` |
| `features` | raw road data (lanes, lane_width_m, speed_limit, curvature, junctions_per_km …) and `*_imputed` flags |
| `proactive_elements` | `cmf_<element>` per ДАБДП element (1.0 = no penalty), `proactive_s`, `imputed_elements` |
| `crash_coverage` | share of crashes with coordinates per year (2022–2023 ≈ 50%) |

`404 {"error": "segment not found"}` for unknown ids.

`GET /segments/{seg_id}/crashes`: FeatureCollection of points, newest first (max 1000): `crash_id, ts_local, year,
hour, type_group, type_raw` (Bulgarian original), `severity, n_killed, n_injured, is_night, in_settlement, wx_*`.

## 4. Road profile chart: `GET /roads/{road}/profile`

```json
{ "road": "A1", "note": "...",
  "series": [ { "carriageway": "dual", "part_no": 1, "km_total": 359.1,
                "points": [ { "seg_id": "A1:d01:001", "km_from": 0, "km_to": 1.001, "class": 3, "score": 65.2,
                              "reactive_pct": 48.4, "proactive_pct": 90.5, "proactive_s": 65.9,
                              "n_serious": 0, "n_fatal": 0, "in_settlement": false, "settlement": null,
                              "oblast": "София-град", "top_reason": "crash_type:angle" } ] } ] }
```

One series per carriageway part, longest first. **Dual roads have two series (one per direction) and they count km
from opposite ends** (on A1 near Yambol one direction is at km ~275, the other at km ~80). Show one series at a time
(direction toggle) rather than both on one axis. `score` is null for town sections: draw a gap.

`GET /roads`: `[{road, road_class, segments, km, carriageways, avg_score, class45_segments}]`, A → III.

## 5. "Fix these first": `GET /priorities?limit=50&road_class=I,II&oblast=Ямбол&road=A1`

All filters optional; `limit` 1–500 (default 50). Ordered by `priority_rank`: first the class-5 segments (clearly more
serious crashes than normal) by excess crashes, then the rest by score. Each item: `priority_rank, seg_id, road,
road_class, oblast, municipality, km_from, km_to, class, priority, score, n_serious, n_fatal, expected_serious, excess,
top_reasons, fixes, center` (GeoJSON point for `flyTo`).

## 6. Crash list for an area: `GET /crashes?bbox=…`

`bbox=min_lon,min_lat,max_lon,max_lat` (required), optional `from, to` (years), `severity=fatal,injury`,
`type=rear_end,head_on`, `night=true|false`, `weather=fog,rain,wind,ice`, `limit` (≤ 10000, default 2000).
FeatureCollection of points. For the map itself use the tiles (§2), this is for lists and small areas.

---

## 7. Live "risk now": `GET /live/sections`

FeatureCollection of **~3-km sections** (the same sections as vlado's АПИ road-status queries). Updated every
15–20 min. Server-side cached: ~10–60 ms per request; a cold start of the whole network takes ~0.5 s locally.

| Parameter | |
|---|---|
| `vehicle` | `car` (default) or `heavy` (> 3.5 t). Changes which АПИ restrictions apply |
| `weight` | tonnes (> 3.5), e.g. `18`; **needs `road`** |
| `road` | e.g. `A1`: only that road (recommended for the road view) |
| `bbox` | `min_lon,min_lat,max_lon,max_lat` (whole country without it: ~7,900 sections, a few MB) |
| `min_level` | e.g. `high`: only sections at or above that level |

Properties:

| Field | Meaning |
|---|---|
| `section_id` | `A1:dual:1:15` = road : carriageway : part : section |
| `road, road_class, carriageway, km_from, km_to, oblast` | location |
| `base_score`, `base_score_max`, `base_class` | our historical risk: length-weighted mean of the 1-km scores / worst 1-km score / worst class |
| `conditions` | active now, any of `fog`, `rain_heavy`, `wind_strong`, `ice`, `night` |
| `multiplier` | product of the multipliers of the active conditions (from historical crashes, `/meta` → `weather_multipliers`) |
| `risk_now` | `base_score × multiplier`, max 100 |
| `road_status_score`, `road_status_level` | vlado's score from live АПИ events (null / `unknown` when the АПИ data is > 45 min old) |
| `access_status` | `no_reported_ban`, `conditional`, `blocked`, `unknown` |
| `events` | АПИ events on this section: `[{id, kind, score, description, vehicle_rules}]` |
| `warnings` | MeteoAlarm warnings for the oblast: `[{event, type, level (yellow/orange/red), title, onset, expires}]` |
| `weather_status` | `ok` (reading ≤ 90 min old), `stale` (older: **not used** for `conditions`), `missing` (no reading). **Show stale/missing to the user** with `weather.observed_at` |
| `weather` | `{status, temperature_2m, visibility_m, wind_gusts_kmh, precip_1h_mm, weather_code, observed_at, road_surface_c, station}` |
| **`live_score`**, **`live_level`** | the higher of `risk_now` and `road_status_score`. Level on vlado's scale: `low` < 35 ≤ `moderate` < 60 ≤ `high` < 80 ≤ `very_high`; `blocked` when access is blocked; `unknown` without data. **Colour the live layer by this** |
| `updated_at` | newest of the weather and АПИ data used |

## 8. Live event icons: `GET /live/events?bbox=…&road=A1&full=true`

FeatureCollection of points (middle of the event's stretch). `full=true` adds `line` (the event's full geometry).
Properties: `id, icon, feed, type, subtype, road, description` (Bulgarian, from АПИ), `starts_at, ends_at`.

`icon` values (draw your own icons for these): `accident, closure, lane_closure, roadworks, detour, speed_limit,
restriction, reversible, obstacle, surface, fog, ice, snow, wind, weather, event, info`.

## 9. Weather: `GET /live/warnings`, `GET /live/weather`

`/live/warnings`: active MeteoAlarm warnings, one row per warning and oblast: `oblast, area, event, awareness_type, condition`
(`fog`/`ice`/`wind_strong`/`rain_heavy`/null), `level` (`yellow`, `orange`, `red`), `severity, onset, expires, title`.
Credit "MeteoAlarm" in the footer (CC BY 4.0). Empty list = no warnings now.

`/live/weather`: one point per weather cell (~110 × 80 km): `temperature_2m, dew_point_2m, precip_1h, wind_gusts_10m,
cloud_cover_low, visibility, weather_code` (WMO; 45/48 = fog) and the flags `fog, rain_heavy, wind_strong, ice`.

## 10. Status and summary

- `GET /live/status`: `[{feed, last_ok, last_error, error, rows, age_s}]` for `open_meteo, bgtoll_traffic,
  bgtoll_stations, meteoalarm, api_road_status`. Use `age_s` for "updated x min ago".
- `GET /stats/summary`: `crashes_total, crashes_on_network, fatal_on_network, segments, network_km, class5_segments,
  validation` (object of the numbers below).
- `GET /meta`: legends (`classes`, `live_levels`), `data_period`, default weights, `weather_multipliers`, model
  `weights`, `validation` rows `{metric, value, note}`.
- `GET /health`: `{ok, db_time, segments, feeds}`.

Pitch numbers in `validation` (score built on 2021–2023, tested on 2024):
`top10_priority_fatal` = 0.241 (the top 10% of the "fix these first" list had 24.1% of the 2024 fatal crashes),
`top10_score_fatal` = 0.237, `top10_baseline_fatal` = 0.255 (ranking by past crash count alone), `chance` = 0.10.
So: about 2.4x chance, close to (slightly below) the past-crash-count baseline, but with reasons and fixes.
Segments that tie at the cut-off count proportionally, so the numbers do not depend on sort order.

## 11. Reason keys

`curvature, access_points, junctions, roadside, lane_width, shoulder, overtaking, vulnerable_users, markings,
speed_undivided` (road), `crash_history, night, crash_type:<type_group>` (crashes), `weather:fog, weather:rain_heavy,
weather:wind_strong, weather:ice` (weather). BG/EN labels: `analysis/config/reasons.json` (they also come inside every
reason object, so a lookup is only needed for `top_reason` in the tiles).

## Errors

`400 {"error": "..."}` for bad parameters (also a malformed JSON body), `404` for unknown ids or paths,
`500 {"error": "internal error"}`. Parameters given twice (`road=A1&road=A2`) are rejected on `/live/sections`.
CORS is open (`*`) unless the server sets `CORS_ORIGIN`.

## Things to show in the UI

- Data until **13 April 2025**; the November 2026 Yambol pile-up is not in it.
- Grey segments = inside settlements, not assessed (ДАБДП leaves out town sections).
- Reasons with `estimated: true` and the proactive part rely partly on road-class defaults (no public data on lane
  width, shoulders, markings).
- Live data: weather (Open-Meteo), traffic and road weather stations (bgtoll.bg), warnings (MeteoAlarm), road events (АПИ).

## 12. Route and section (used by `/demo`)

- `POST /api/route` — body `{origin: {coordinates: [lon, lat]}, destination: {coordinates: [lon, lat]}, vehicleType: "car" | "truck"}`.
  Route geometry from Mapbox Directions (server side, `MAPBOX_TOKEN` in `backend.env`); risks = the ~3-km sections the
  route drives on (`api.route_risk`, `backend/sql/route.sql`), consecutive sections of the same road and level merged.
  `level`: `high` if baseline class ≥ 4 or live АПИ level high/very_high/blocked, `medium` if class 3 or live moderate;
  low sections are not returned. Each risk also has `sections` (ids), `baseClass`, `liveLevel`, `events`. Format:
  `docs/route-api.md`. ~5 s for Sofia–Burgas.
- `GET /api/sections/{section_id}` — one section (`A1:dual:1:19`): `base_class`, `base_score`, `top_reasons`, `fixes`
  (from its highest-scoring 1-km segment), `live.car` / `live.heavy` (АПИ status, `unknown` if older than 45 min),
  `crashes_by_year`, `crashes_by_type`, `segments` (the 1-km segments with their scores), geometry as MultiLineString.
