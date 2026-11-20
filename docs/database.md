# SafetyCar database (PoC)

PostgreSQL 17 + PostGIS 3.5 on `wp-host`, database **`safetycar`**, listening on **localhost only**.
Built by the scripts in `db/` (order and inputs: `db/run_all.sh`). Method: `docs/data-aggregation.md`.

All geometries are stored twice: `geom` in **EPSG:4326** (lon/lat, for Mapbox/GeoJSON) and `geom_m` in
**EPSG:3035** (metres, for distances). Use `geom` in the API, `geom_m` in analysis.

## Connecting from the backend

The backend runs on `wp-host` and connects to `localhost:5432`.

| Role | Rights | Use |
|---|---|---|
| `safetycar_ro` | `SELECT` on `public` and `api`, `EXECUTE` on `api.*` | the backend |
| `safetycar` | owner | pipeline scripts only |

The connection settings are on the server in **`/data/home/safetycar/backend.env`** (mode 600, owner `safetycar`,
outside the web root, not in git): `DATABASE_URL` plus the `PG*` variables. Run the backend as the `safetycar` user and
load that file (systemd `EnvironmentFile=/data/home/safetycar/backend.env`, or `node --env-file=/data/home/safetycar/backend.env`).

From a laptop, only through SSH: `ssh -L 5433:localhost:5432 wp-host`, then connect to `localhost:5433`.

## What the backend should read

Start with schema **`api`**: it hides the pipeline tables and is what the frontend needs.

| Object | What | Typical endpoint |
|---|---|---|
| `api.segments_mvt(z, x, y)` | Mapbox vector tile, layer `segments` | `GET /tiles/segments/{z}/{x}/{y}.pbf` |
| `api.crashes_mvt(z, x, y, from_year, to_year)` | Mapbox vector tile, layer `crashes` | `GET /tiles/crashes/{z}/{x}/{y}.pbf?from=2021&to=2025` |
| `api.segments` (view) | one row per segment: location, road features, crash totals 2021–2024 | `GET /segments/{seg_id}` |
| `api.crashes` (view) | crashes on the national network | `GET /segments/{seg_id}/crashes` |
| `api.segments_geojson(min_lon, min_lat, max_lon, max_lat)` | GeoJSON FeatureCollection for a small bbox | `GET /segments.geojson?bbox=…` |

Tiles: segments are thinned by zoom (z < 7: A and I only, z < 9: + II), crashes without injuries only from z ≥ 10.
Return the bytes with `Content-Type: application/vnd.mapbox-vector-tile`; an empty tile is a valid response.

### Examples

```sql
-- vector tile (Node: res.type('application/vnd.mapbox-vector-tile').send(row.tile))
select api.segments_mvt($1, $2, $3) as tile;

-- one segment with its yearly history
select * from api.segments where seg_id = $1;
select * from segment_year_stats where seg_id = $1 order by year;

-- the 20 most dangerous segments outside settlements (serious crashes per km and year, 2021–2024)
select seg_id, road, oblast, settlement, serious_per_km_year, n_fatal_2021_2024
from api.segments where not in_settlement order by serious_per_km_year desc limit 20;

-- segments near a point (e.g. the user's location), 2 km
select seg_id, road, serious_per_km_year
from api.segments
where st_dwithin(geom::geography, st_point($lon, $lat, 4326)::geography, 2000)
order by geom <-> st_point($lon, $lat, 4326) limit 10;

-- crash heatmap points for one oblast and year
select st_x(geom) lon, st_y(geom) lat, severity from api.crashes where oblast = 'Пловдив' and year = 2024;
```

Node (`pg`):

```js
import pg from 'pg'
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
app.get('/tiles/segments/:z/:x/:y.pbf', async (req, res) => {
  const { z, x, y } = req.params
  const { rows } = await pool.query('select api.segments_mvt($1, $2, $3) as tile', [+z, +x, +y])
  res.type('application/vnd.mapbox-vector-tile').set('Cache-Control', 'public, max-age=3600').send(rows[0].tile)
})
```

Mapbox GL:

```js
map.addSource('segments', { type: 'vector', tiles: [`${API}/tiles/segments/{z}/{x}/{y}.pbf`], minzoom: 5, maxzoom: 14 })
map.addLayer({ id: 'segments', type: 'line', source: 'segments', 'source-layer': 'segments',
  paint: { 'line-width': 3, 'line-color': ['interpolate', ['linear'], ['get', 'serious_per_km_year'], 0, '#3DDC97', 0.3, '#FFC53D', 1, '#E5212E'] } })
```

## Tables

### `crashes`: one row per crash (138,233)

Built from `crash_rows` (one row per person, 253,674) by grouping on `(date, time, type, lat, lon)`; the totals match NSI.

| Column | Type | Meaning |
|---|---|---|
| `crash_id` | text PK | 12-char hash of the crash key |
| `ts_local` / `ts_utc` | timestamp / timestamptz | Europe/Sofia local time / UTC |
| `year`, `month`, `hour`, `dow` | int | from `ts_local`; `dow` 1 = Monday |
| `type_raw` / `type_group` | text | MVR type / one of 13 groups (`rear_end`, `side`, `angle`, `head_on`, `run_off_road`, `rollover`, `pedestrian`, `cyclist`, `parked`, `animal_cart`, `obstacle`, `train`, `other`) |
| `n_persons`, `n_killed`, `n_injured` | int | people involved / killed / injured |
| `severity` | text | `fatal`, `injury`, `damage` |
| `epdo` | int | 10 / 3 / 1 |
| `lon`, `lat`, `geom`, `geom_m` | | NULL when not usable |
| `coord_decimals`, `loc_quality` | int, text | `good` (≥ 4 decimals, ≤ 10 m), `approx` (3, ~100 m), `unusable`, `missing` |
| `sun_elev_deg`, `is_night` | real, bool | night = sun below −6° at the crash point |
| `seg_id`, `snap_dist_m` | text, real | nearest national-road segment (≤ 30 m good / ≤ 100 m approx), else NULL |
| `in_settlement`, `settlement` | bool, text | crash point inside a built-up area |
| `oblast`, `municipality` | text | from OSM boundaries |
| `wx_cell_id` | text | 1° weather cell, e.g. `42.5_25.5` |
| `wx_fog`, `wx_rain_heavy`, `wx_wind_strong`, `wx_ice` | bool | weather in that cell and hour; NULL outside 2023-04-14 … 2025-04-13 |
| `source_row` | int | first `crash_rows.row_no` of the crash |

Coordinates come from the `PTP_Layer` shapefile (full precision); the CSV lost precision to Excel in 55,837 rows.

### `crash_coverage`: share of crashes with coordinates, per (`year`, `severity`)

`n_total`, `n_located`, `coverage`. Multiply counts by `1 / coverage` to correct for missing locations
(2022–2023: about 50%; 2024–2025: 89–100%).

### `segments`: national roads cut into ~1 km pieces

| Column | Meaning |
|---|---|
| `seg_id` | `<road>:<s|d><part>:<piece>`, e.g. `I-1:s01:007`; `d` = one carriageway of a dual road |
| `road`, `road_class` | `A1`, `I-1`, `II-86`, `III-197` / `A`, `I`, `II`, `III` (from OSM `ref`) |
| `carriageway` | `single` or `dual` (motorways and other dual roads are segmented per direction) |
| `part_no`, `piece_no`, `km_from`, `km_to` | position along the merged OSM line part; **not** official АПИ km |
| `length_m` | 500–1,500 m (shorter for parts < 1 km) |
| `oblast`, `municipality`, `settlement` | at the midpoint / main settlement crossed |
| `settlement_share`, `in_settlement` | share of length inside built-up areas; `in_settlement` = share > 0.5 |
| `highway` | OSM class at the midpoint |
| `wx_cell_id` | weather cell at the midpoint |

### `segment_features`: raw values for the 9 ДАБДП elements (one row per segment)

`lanes`, `lane_width_m`, `shoulder_type`, `has_overtaking_lane`, `has_sidewalk`, `marking_quality` (always NULL),
`speed_limit`, `is_divided`, `is_lit`, `surface`, `roadside_obstacle_share` (+ `_forest_`, `_building_`),
`curvature_deg_per_km`, `min_radius_m`, `access_per_km`/`n_access`, `junctions_per_km`/`n_junctions`,
`crossings_per_km`/`n_crossings`, `n_traffic_signals`, `n_bus_stops`, `n_level_crossings`.
Every value that came from a class default has `*_imputed = true`.

### `segment_year_stats`: one row per (`seg_id`, `year`), crashes outside settlements only

`n_crashes, n_fatal, n_injury, n_damage, n_killed, n_injured, epdo, n_night, n_fog, n_rain, n_ice, n_wind`
and `n_<type_group>` for each of the 13 groups. Segments without crashes have zeros.

### Weather

| Table | Grain | Columns |
|---|---|---|
| `weather_hourly` | (`wx_cell_id`, `ts_utc`) | `temperature_2m, dew_point_2m, precipitation, snowfall, wind_gusts_10m, cloud_cover, cloud_cover_low` + flags `wx_fog, wx_rain_heavy, wx_wind_strong, wx_ice` |
| `cell_condition_hours` | (`wx_cell_id`, `year`, `condition`) | `hours`; condition ∈ `all, fog, rain_heavy, wind_strong, ice` (denominator for the relative risk) |

PoC limits: ERA5 via Open-Meteo, **1° cells** (~110 × 80 km), **2023-04-14 … 2025-04-13** only.
Flag rules (in `db/07_weather.sql`): fog = low cloud ≥ 90% and T − Td ≤ 1 °C; heavy rain ≥ 2 mm/h;
strong wind = gusts above the cell's 95th percentile; ice = T ≤ 2 °C and (cloud cover ≤ 30% or precipitation in the last 6 h).

Relative risk for a condition in a cell:

```sql
select c.wx_cell_id,
       (count(*) filter (where c.wx_fog))::float / nullif(h.fog, 0)
     / ((count(*))::float / h.all_) as rr_fog
from crashes c
join (select wx_cell_id, sum(hours) filter (where condition = 'all') as all_,
             sum(hours) filter (where condition = 'fog') as fog
      from cell_condition_hours group by 1) h using (wx_cell_id)
where c.wx_fog is not null and c.seg_id is not null and not c.in_settlement
group by c.wx_cell_id, h.fog, h.all_;
```

### Reference layers

`oblasts` (28), `municipalities` (265), `settlements` (built-up areas with `name`, `place`), and the raw OSM import in
schema `osm` (`highways`, `road_points`, `areas`, `admin`, `places`; the backend has no access to it).
`road_ways` / `road_parts` are intermediate tables of the segment build.

## Known limits

- OSM snapshot 2026-11-19 vs crashes 2021-01 … 2025-04-13; roads built after a crash are still on the map.
- km are along OSM lines, not АПИ kilometre posts. Dual carriageways count as two segments.
- 2022–2023 have ~50% located crashes: use `crash_coverage`.
- Signs and markings condition (`marking_quality`) has no public source.
