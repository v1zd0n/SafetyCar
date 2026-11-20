# Real-time data requests

The live feeds the analysis backend needs for the **"risk now"** layer, apart from АПИ. Every request
below was tested on 2026-11-20 and returned real data. Field names and samples come from those responses.

Related: `docs/data-aggregation.md` (method), `docs/database.md` (tables in PostGIS).

---

## Overview

| # | Source | What it gives | Key | Refresh | Used for |
|---|---|---|---|---|---|
| 1 | Open-Meteo forecast API | Current weather per point (incl. visibility, fog code) | none | 15 min | Weather multipliers. **Main weather source** |
| 2 | bgtoll.bg traffic counters | Vehicles per 15 min / 1 h, speed, vehicle class, at 518 points | none | 20 min | Traffic and heavy-vehicle multiplier, congestion |
| 3 | bgtoll.bg road weather stations | Air **and asphalt** temperature, humidity, wind at 91 stations | none | ~1–15 min | Ice flag, local check of the model |
| 4 | MeteoAlarm (Bulgaria) | Official weather warnings per oblast | none | on change | Banner + extra multiplier when a warning is active |
| — | Sun position | Night / twilight | none, computed locally | — | Night multiplier |

**Rule:** live flags must use **the same rules as the historical flags** in `db/07_weather.sql`. Otherwise the
relative risks we estimated from history don't apply to them.

---

## 1. Open-Meteo forecast API: current weather

```
GET https://api.open-meteo.com/v1/forecast
    ?latitude=42.48,42.15            # comma lists = many points in one request
    &longitude=26.50,24.75
    &current=temperature_2m,dew_point_2m,relative_humidity_2m,precipitation,rain,snowfall,
             weather_code,cloud_cover_low,visibility,wind_gusts_10m,is_day
    &timezone=UTC
```

- Response: a JSON array, one object per point. Values are in `current` (`time`, `interval: 900`).
  Units: °C, mm, cm (snow), % (cloud), **m (visibility)**, km/h (gusts).
- Sample (Yambol area, 11:15 UTC): `temperature_2m 20.0, dew_point_2m 7.1, cloud_cover_low 51, visibility 42820, weather_code 2`.
- **Which points:** the centres of the existing `wx_cell_id` cells (1°, about 20 points over Bulgaria), so live flags
  line up with `cell_condition_hours`. All in **one request every 15 min** ≈ 2k point-calls/day. The free limit is
  10k/day, non-commercial. For the demo we can add points along A1 near Yambol for a finer view.
- Flags, same as history:
  - `fog` = `cloud_cover_low ≥ 90` and `temperature_2m − dew_point_2m ≤ 1`
  - `rain_heavy` = `precipitation ≥ 2` (mm in the last 15 min ×4 ≈ mm/h; agree on this)
  - `wind_strong` = gusts above the cell's 95th percentile from `weather_hourly`
  - `ice` = `temperature_2m ≤ 2` and (`cloud_cover_low` low or precipitation in the last 6 h)
- Visibility and `weather_code` 45/48 (WMO fog codes) are **shown in the UI** ("visibility 180 m"). They are not used for
  the multiplier, because ERA5 history has no visibility to estimate a relative risk from.

## 2. bgtoll.bg traffic counters (toll cameras)

```
GET https://bgtoll.bg/index.php/traffic_passes/data
```

- Undocumented JSON used by the map at `bgtoll.bg/traffic_passes`. The page itself polls it every **20 min**.
  `?feed=speed` returns the same content. ~1.6 MB per response, with a UTF-8 BOM (decode with `utf-8-sig`).
- Response: an array of **518 counting points**:

  | Field | Example | Meaning |
  |---|---|---|
  | `scp`, `name`, `nameENG` | `10041`, `Чурек` | point id / name |
  | `lat`, `lon` | `"42.778613"` (string) | location |
  | `count15min`, `count1Hour` | `1190` | vehicles |
  | `average_speed_15min`, `average_speed_1Hour` | `27.0` | speed. **Unit not stated.** Values 4.5–37, so most likely **m/s** (27 m/s ≈ 97 km/h). Confirm before use |
  | `classes1Hour` / `classes15min` | `class1_light`, `class3_heavy_12t`, `class7_heavy_5a`, `class8_bus_12t`, … (11 classes) | count per vehicle class |
  | `avg_speed_classes_1Hour` | same 11 classes | speed per class |
  | `time` | `2026-11-20 11:04:17` | **UTC** (fetched at 13:24 local) |

- Derived per point: `heavy_share = (class3..class7 + class9) / count1Hour`, `speed_ratio = speed / usual speed for that point and hour`.
- **Mapping to segments:** snap each `scp` to the nearest segment (≤ 200 m, same road). Use that value for the
  segment and its neighbours up to the next counter. The mapping file the site uses (`point_segments_master_*.geojson`)
  returns 404, so we build our own.
- **No history is offered**, so "usual speed" and a traffic relative risk can't be estimated from the past.
  → **Start logging every response now** (`live_traffic` table, see below). After a few days we have normal values per point and hour.

## 3. bgtoll.bg road weather stations (МТО)

```
GET https://bgtoll.bg/index.php/mto/data                 # current reading per station
GET https://bgtoll.bg/index.php/mto/history              # recent readings per station (15-min steps)
GET https://bgtoll.bg/index.php/mto/raindata             # model weather at each station
GET https://bgtoll.bg/index.php/mto/temperaturefallback  # station vs model check
```

Also undocumented JSON behind `bgtoll.bg/mto`.

- `mto/data`: array of **91 stations**: `station_id, scp, name, lat, lon, air, surface` (asphalt °C), `humidity, pressure,
  wind, wind_dir, time` (UTC, e.g. `2026-11-20 11:15:00`). All 91 had a `surface` value.
- `mto/history`: object keyed by `station_id` → list of `{ts (unix), air, surface, humidity, pressure, wind, wind_dir}`.
  Short (1–12 readings per station), so **not a historical source**.
- `mto/raindata`: object keyed by `station_id` → model values incl. `visibility, weather_code, rain_1h, precip_3h,
  dew_point, cloud, wind_gusts, freezing_level_height`, `stale` (bool).
- `mto/temperaturefallback`: per station, `status`, `use_model`, `station_temp`, `model_temp`, `difference`.
  **Use it to skip faulty stations** (`use_model = true` or `status != 'ok'`).
- Used for: **`ice_now` = `surface ≤ 0 °C`** at the nearest station (≤ 20 km, same road if possible). This is the ice
  rule from the guidelines ("asphalt ≤ 0 °C where there is data") and is better than the model.

## 4. MeteoAlarm warnings for Bulgaria

```
GET https://feeds.meteoalarm.org/feeds/meteoalarm-legacy-atom-bulgaria
```

- Atom XML, CC BY 4.0 (credit "MeteoAlarm" in the footer). 37 warnings at the time of the test.
- Per `<entry>`: `cap:geocode` NUTS3 code (e.g. `BG333`) + `cap:areaDesc` (`Shumen`), `cap:event` (`Strong wind!`),
  `cap:onset`, `cap:expires`, `cap:severity` (`Moderate` = yellow, `Severe` = orange, `Extreme` = red),
  `title` (`Yellow Wind Warning issued for Bulgaria - Shumen`).
- Mapping: NUTS3 → oblast. This needs a small lookup table of 28 rows, because `oblasts` in the DB has OSM names, not NUTS codes.
- Used for: a warning banner on the segment card, and as a confirmation for the fog/ice/wind flags. If there is a warning
  for that condition in that oblast, the flag counts as active even when the model doesn't show it.

## Sun position (no request)

`is_night` = sun elevation < −6° at the segment midpoint, the same rule as `crashes.is_night`. Computed in the backend
(e.g. `suncalc` for Node, or the same SQL function the DB pipeline used).

---

## How "risk now" uses them

```
risk_now(segment) = base_risk(segment)
                  × RR_fog        if fog flag active in the segment's cell
                  × RR_rain_heavy if heavy rain active
                  × RR_wind       if strong wind active
                  × RR_ice        if ice active (station asphalt ≤ 0 °C or model rule)
                  × RR_night      if night at the midpoint
                  × M_traffic     if heavy traffic / congestion at the nearest counter
```

- `RR_*` come from history: `crashes` + `cell_condition_hours` (query in `docs/database.md`). They are computed by
  `weather_rr.py` and stored, not recomputed per request. A condition with a weak estimate (lower CI bound ≤ 1 or
  fewer than 3 crashes) gets RR = 1.
- `RR_night` comes from crashes at night vs night hours (sun position over the same period).
- `M_traffic` stays **1.0 until we have logged a few days** of bgtoll data. After that it becomes a simple rule
  (e.g. ×1.2 if `count1Hour` is above the point's 90th percentile for that hour, or if `speed_ratio < 0.5`).
  It is a fixed rule, not estimated from crashes. We say so in the pitch.

## Proposed storage (to agree with the DB owner)

One poller (cron every 15 min on `wp-host`) writes the feeds into the DB. The backend only reads them.

| Table | Grain | Keep |
|---|---|---|
| `live_weather` | (`wx_cell_id`, `ts_utc`) | Open-Meteo values + 4 flags |
| `live_station` | (`station_id`, `ts_utc`) | air, surface, humidity, wind, `use_model` |
| `live_traffic` | (`scp`, `ts_utc`) | counts, speeds, `heavy_share` |
| `live_warnings` | (`identifier`) | oblast, event, severity, onset, expires |
| `traffic_points`, `weather_stations` | one row per point | lat/lon, `geom`, nearest `seg_id` (computed once) |
| `api.risk_now` (view) | one row per segment | base risk, active conditions, multipliers, `risk_now`, `updated_at` |

Keep every row (don't overwrite). The logged history is what lets us estimate the traffic effect later.

---

## Risks and rules

- **bgtoll endpoints are not a public API.** No documentation, no terms, and they can change or block us without
  notice. Poll no more often than their own page (20 min traffic, 15 min weather), send one request per feed per
  cycle, cache the last good response, and **keep serving the last values with their timestamp** if a call fails.
  Ask БГ ТОЛ for permission if we use this beyond the hackathon demo.
- **Open-Meteo free tier is non-commercial.** Fine for the hackathon. A commercial product needs their paid plan.
- **All times are UTC** in the feeds. Convert to Europe/Sofia only for display.
- **Demo fallback:** keep one saved response of each feed in the repo (no personal data in any of them). If the
  network fails on stage, the backend can switch to it with a flag. Ideally save a foggy day as a scenario.
- Not covered here: **АПИ** live road events (closures, accidents, roadworks), left out on purpose for now.
