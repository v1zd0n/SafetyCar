# Data aggregation plan and missing data

How the raw data should be cleaned and aggregated before it goes into the database, so the
analysis modules (`reactive`, `proactive`, `weather_rr`, `classify`, `explain`, `validate`) can read
ready-made tables. Also lists what data we still don't have.

Owner: analysis. Based on the files in `main` at commit `2a14cb6` and the method in
`RoadEvalGuidelines.docx`.

---

## 1. What we have

| File | What it is | Usable for |
|---|---|---|
| `ptp_history_21to25.csv` (24 MB, 253,674 rows) | MVR crash records, 2021-01-01 → **2025-04-13** | Reactive score, weather RR, validation |
| `NSI PTP/ptp_2021.pdf` … `PTP_2024.pdf` | NSI yearly reports, **aggregate tables only, no locations** | Sanity checks and reference totals (e.g. crashes by road class outside settlements) |
| `RoadEvalGuidelines.docx` | Method (ДАБДП + our weather layer) | — |

Still missing: no road network, no segments, no weather and no traffic data in the repo. See §5.

---

## 2. Findings about the crash CSV

Columns: `year, date (dd/mm/yyyy), time (hh:mm:ss), y, x, type, injured (да/не), died (да/не)`.

### 2.1 One row = one person involved, not one crash

Rows with `died=да` and `injured=да` match the NSI totals for **persons** killed and injured exactly:

| Year | `died=да` rows | NSI killed | `injured=да` rows | NSI injured |
|---|---|---|---|---|
| 2023 | 525 | 525 | 9,101 | — |
| 2024 | 478 | **478** | 9,054 | **9,054** |

`injured` and `died` are never both `да`. 85% of rows are people who were not hurt.
**Never count rows as crashes.** 37% of rows are exact duplicates because they are separate people in the
same crash.

### 2.2 Crash key

Grouping rows by **`(date, time, x, y, type)`** reproduces the NSI crash counts:

| Year | Serious crashes (injury + fatal), ours | NSI | All crashes, ours | NSI |
|---|---|---|---|---|
| 2023 | 6,977 | 6,993 | 32,165 | 32,440 |
| 2024 | 7,172 | **7,173** | 34,650 | **34,705** |

This gives 138,214 crashes in total. Small fix: in 1,082 crashes some people have coordinates and others don't. A row
with no coordinates joins the crash with the same `(date, time, type)` if exactly one such crash
has coordinates.

### 2.3 Coordinates are degrees with the decimal point removed, partly corrupted by Excel

- `x` = longitude, `y` = latitude. Both always have 2 digits before the decimal point (BG: lon 22.3–28.7, lat 41.2–44.3).
  Decode: `digits[:2] + "." + digits[2:]` → `2742903` → 27.42903, `263661673` → 26.3661673.
- **193,458 values are in Excel scientific notation** (`4.31426E+11`). Decode: take the mantissa digits
  (`431426`) and apply the same rule → 43.1426. This loses precision (max 4 decimals ≈ 10 m), which is fine for snapping.
- Precision varies with the number of digits:

  | Decimals | Rows | Accuracy | Use |
  |---|---|---|---|
  | ≤ 2 | 1,252 | ≥ 1 km | drop (`loc_quality = 'unusable'`) |
  | 3 | 9,869 | ~100 m | keep, flag `approx` |
  | ≥ 4 | 166,464 | ≤ 10 m | `good` |

- 38 rows decode outside Bulgaria → drop.
- No x/y swaps found.

### 2.4 Location coverage varies a lot by year (crash level)

| Year | Fatal crashes with coordinates | Injury | Damage only |
|---|---|---|---|
| 2021 | 318 / 447 (71%) | 66% | 75% |
| 2022 | 230 / 460 (50%) | 53% | 61% |
| 2023 | 221 / 444 (50%) | 43% | 49% |
| 2024 | 435 / 437 (99.5%) | 99% | 89% |
| 2025 (Jan–13 Apr) | 74 / 74 | 98% | 97% |

Consequences:
- Raw counts per year can't be compared. 2022–2023 look "safer" only because half the crashes have no location.
- Reactive score: we correct with a per-year, per-severity factor (`1 / coverage`), stored in `crash_coverage` (§3.6).
  This assumes that crashes without coordinates are spread across the map like those with coordinates. That is an
  untested assumption and we state it in the pitch.
- **Validation changes from "2024 → 2025" to "train 2021–2023 → test 2024"**: 2025 ends in April, and 2024 has
  almost complete locations (435 fatal crashes).
- The motivating Yambol fog pile-up (Nov 2026) **is not in this data**. We can only show what the 2021–2024
  data says about that stretch of A1.

### 2.5 Other properties

- **All roads, including city streets.** The densest 0.01° cells are all central Sofia. Snapping to the
  national network + an `in_settlement` flag will keep only a small part. NSI 2024 reference:
  2,302 serious crashes outside settlements on A + I + II + III class roads (265 / 706 / 614 / 717).
  That is our target for checking the snapping.
- No road number, km, oblast, settlement, weather, light, surface, vehicle type, or cause.
- Times cluster at :00 and :30 (rounded by police), which is fine for joining hourly weather.
- `type`: 26 values, including 1,309 `Няма информация`. Mapped to groups in §3.2.
- File has a UTF-8 BOM. Read with `encoding="utf-8-sig"`.

---

## 3. How to aggregate before loading into the DB

Rule: **the DB holds clean facts at the lowest useful level (crash, segment, hour) plus a few
pre-aggregated tables the analysis reads directly.** Scores are not stored here; the analysis writes them.

Storage CRS: EPSG:4326 (what Mapbox and GeoJSON want). The analysis converts to EPSG:3035 for distances.
If we use PostGIS (e.g. Supabase), the tables below map 1:1. If not, the same tables as Parquet files in `data/processed/`.

### 3.1 `crashes`: one row per crash

| Column | Type | How |
|---|---|---|
| `crash_id` | text | short hash of the crash key (§2.2) |
| `ts_local` | timestamp | `date` + `time`, Europe/Sofia |
| `ts_utc` | timestamp | for joining Open-Meteo (UTC) |
| `year`, `month`, `hour`, `dow` | int | from `ts_local` |
| `type_raw` | text | original Bulgarian value |
| `type_group` | text | §3.2 |
| `n_persons`, `n_killed`, `n_injured` | int | count of rows / `died=да` / `injured=да` |
| `severity` | text | `fatal` if `n_killed>0`, else `injury` if `n_injured>0`, else `damage` |
| `epdo` | int | fatal 10, injury 3, damage 1 |
| `lon`, `lat`, `geom` | float / point | decoded (§2.3), null if unusable |
| `coord_decimals`, `loc_quality` | int / text | `good` / `approx` / `unusable` / `missing` |
| `is_night` | bool | sun altitude < −6° (civil twilight) at crash point & time. Computed, not in data |
| `seg_id` | text | nearest national-road segment (§3.4), null if not on the network |
| `snap_dist_m` | float | distance to `seg_id` |
| `in_settlement` | bool | crash point inside a settlement polygon |
| `oblast` | text | spatial join |
| `wx_cell_id` | text | nearest weather cell |
| `wx_fog`, `wx_rain_heavy`, `wx_wind_strong`, `wx_ice` | bool | weather flags for that cell and hour (§3.5) |

The frontend's filters (year, type, severity, night, fog/rain) work on a GeoJSON export of this table,
filtered to `seg_id IS NOT NULL`.

### 3.2 `type_group` mapping

| `type_group` | `type_raw` values |
|---|---|
| `rear_end` | СБЛЪСКВАНЕ МЕЖДУ МПС ОТЗАД; БЛЪСКАНЕ НА СПРЯНО ППС |
| `side` | СБЛЪСКВАНЕ МЕЖДУ МПС СТРАНИЧНО |
| `angle` | СБЛЪСКВАНЕ МЕЖДУ МПС ПОД ЪГЪЛ |
| `head_on` | СБЛЪСКВАНЕ МЕЖДУ МПС ЧЕЛНО |
| `run_off_road` | БЛЪСКАНЕ В КРАЙПЪТНО СЪОРЪЖЕНИЕ / ПРЕДПАЗНА ОГРАДА / ДЪРВО / СТЪЛБ / СКАТ / ПОДПОРНА КОЛОНА / БИЛБОРД; ПРЕОБРЪЩАНЕ НА МПС ИЗВЪН ПЪТНОТО ПЛАТНО |
| `rollover` | ПРЕОБРЪЩАНЕ НА МПС НА ПЪТНОТО ПЛАТНО |
| `pedestrian` | БЛЪСКАНЕ НА ПЕШЕХОДЕЦ; БЛЪСКАНЕ НА ДЕТЕ С ЛЕТНИ КЪНКИ, РОЛЕР, ШЕЙНА; БЛЪСКАНЕ НА ЛИЦЕ РАБОТЕЩО НА ПЪТЯ |
| `cyclist` | БЛЪСКАНЕ НА ВЕЛОСИПЕДИСТ |
| `parked` | БЛЪСКАНЕ НА ПАРКИРАНО ППС |
| `animal_cart` | БЛЪСКАНЕ НА ЖИВОТНО; БЛЪСКАНЕ НА КАРУЦА |
| `obstacle` | БЛЪСКАНЕ В ПРЕПЯТСТВИЕ НА ПЪТЯ |
| `train` | БЛЪСКАНЕ НА ППС И ВЛАК |
| `other` | ПАДАНЕ НА ПЪТНИК; ДРУГ ВИД ПТП; Няма информация |

`БЛЪСКАНЕ НА СПРЯНО ППС` goes into `rear_end` because pile-ups in fog are recorded as rear-end crashes plus hits on stopped vehicles.

### 3.3 `segments`: one row per 1-km segment (from the data teammate)

The agreed contract plus three columns:

`seg_id, road, road_class (A/I/II/III), km_from, km_to, oblast, length_m, geometry`
**+ `settlement_share` (0–1, share of length inside settlements), `in_settlement` (share > 0.5), `wx_cell_id`.**

### 3.4 Snapping rules (crash → segment)

- Work in EPSG:3035. Nearest segment within **30 m** for `good` crashes and **100 m** for `approx` ones; otherwise `seg_id = null`.
- At grade-separated crossings (overpasses), the nearest line may be the wrong road. Accept this for the hackathon.
- Check: the number of serious crashes snapped outside settlements per road class should come out close to the
  NSI table in §2.5, after the coverage correction.

### 3.5 `segment_features`: one row per segment, raw values for the proactive score

One column per ДАБДП element plus an `_imputed` flag each. These are **raw values**; the CMF/RF conversion happens in `proactive.py`.

| Element | Column(s) | Unit |
|---|---|---|
| Lane width | `lane_width_m`, `lanes` | m, count |
| Roadside | `roadside_obstacle_share` | share of length with forest / buildings within 10 m |
| Curvature | `curvature_deg_per_km`, `min_radius_m` | can be computed from geometry |
| Access points | `access_per_km` | crossings with `highway=track/service/unclassified/residential` |
| Junctions | `junctions_per_km` | crossings with tertiary or higher |
| Pedestrian/cyclist conflict | `crossings_per_km`, `has_sidewalk` | |
| Shoulder | `shoulder_type` | none / unpaved / paved |
| Overtaking lanes | `has_overtaking_lane` | bool |
| Signs and markings | `marking_quality` | no public source → imputed |
| Extras (not in the ДАБДП list) | `speed_limit`, `is_divided`, `is_lit` | |

### 3.6 Pre-aggregated tables the analysis reads

**`segment_year_stats`**: one row per (`seg_id`, `year`), only crashes with `in_settlement = false`:
`n_crashes, n_fatal, n_injury, n_damage, n_killed, n_injured, epdo, n_night, n_fog, n_rain, n_ice, n_wind,`
plus one count per `type_group` (`n_rear_end`, `n_head_on`, …).
Segments with zero crashes still get a row (zeros matter for the negative binomial model).

**`crash_coverage`**: one row per (`year`, `severity`): `n_total, n_located, coverage`. Used for the 1/coverage correction.

**`weather_hourly`**: one row per (`wx_cell_id`, `ts_utc`), 2021-01-01 → 2025-04-13, from the Open-Meteo archive (ERA5):
`temperature_2m, dew_point_2m, relative_humidity_2m, precipitation, rain, snowfall, wind_gusts_10m, cloud_cover_low, is_day`,
plus the flags `wx_fog, wx_rain_heavy, wx_wind_strong, wx_ice`. Starting rules (to tune):
- fog: `cloud_cover_low ≥ 90%` and `temperature_2m − dew_point_2m ≤ 1 °C`. ERA5 has no visibility, so this is a proxy.
- heavy rain: `precipitation ≥ 2 mm/h`.
- strong wind: gusts above the top 5% for that cell.
- ice: `temperature_2m ≤ 2 °C` and (clear sky or precipitation/snow in the last 6 h).

**`cell_condition_hours`**: one row per (`wx_cell_id`, `year`, `condition`): `hours`. This is the denominator for the relative-risk ratio.
Store it so the analysis never has to scan the hourly table.

Size estimate: Bulgaria has ~400 ERA5 cells (0.25°) × 37k hours ≈ 15M rows. Only download cells that national
roads touch. If that's too heavy, aggregate straight into `cell_condition_hours` + crash-hour flags and skip storing the hourly table.

### 3.7 Time windows

| Purpose | Crash years |
|---|---|
| Production score (map) | 2021–2024, coverage-corrected (≥ 3 years as the ДАБДП method requires) |
| Validation | train 2021–2023 → test on 2024 fatal crashes (share in our top 10% of segments) |
| Weather RR | 2021-01 → 2025-04 |

---

## 4. Pipeline order

1. `clean_crashes`: decode coordinates, group rows into crashes, add `type_group`, `epdo`, `is_night`, `ts_utc` → `crashes` (no `seg_id` yet). **Can run now. Needs only the CSV.**
2. `crash_coverage` → can run now.
3. `segments` (data teammate) → blocks step 4.
4. Snap crashes → fill `seg_id`, `snap_dist_m`, `in_settlement`, `oblast`.
5. `segment_features` (data teammate, OSM).
6. Weather download → `weather_hourly`, `cell_condition_hours`, crash weather flags.
7. `segment_year_stats`.
8. Analysis modules read 3, 5, 6, 7.

---

## 5. What is missing

| # | Missing | Needed for | Likely source | Owner | Priority | Fallback |
|---|---|---|---|---|---|---|
| 1 | **National road network with road number, class and km** | Segments, everything | АПИ open data (api.bg), OSM `ref` + `highway` (Geofabrik) | Data | **Blocker** | OSM only; km = distance along the line from its start |
| 2 | **Settlement boundaries** | `in_settlement` (ДАБДП leaves out town sections) | OSM `place=*` polygons / `landuse=residential`, or EKATTE boundaries | Data | High | Buffer around OSM `place=town/village` points |
| 3 | Oblast boundaries | `oblast`, comparisons with NSI | OSM admin level 6, GADM | Data | Medium | — |
| 4 | Road element attributes (§3.5) | Proactive score | OSM (`width`, `lanes`, `shoulder`, `sidewalk`, `lit`, `maxspeed`, junctions, tracks), land use | Data | High | Road-class median + `_imputed` |
| 5 | Signs/markings condition, roadside barriers | 2 of the 9 ДАБДП elements | No public dataset. Maybe Mapillary detections | — | Low | Imputed; say so in the pitch |
| 6 | **Hourly weather 2021-01 → 2025-04** | Weather RR, crash weather flags | Open-Meteo archive API (no key) | Data | High | — |
| 7 | CMF values for the 9 elements | Proactive score | CMF Clearinghouse, iRAP, HSM | Analysis | High | — |
| 8 | Crashes after 2025-04-13 (incl. Nov 2026 Yambol pile-up) | A current map, the story | opendata.yurukov.net/mvr, MVR, chernapista.com | Data | Medium | State the data end date on the map |
| 9 | Coordinates for 2022–2023 crashes (~50% missing) | Fair multi-year score | Same sources, maybe a newer export | Data | Medium | Coverage correction (§2.4) |
| 10 | Traffic volumes (AADT, heavy-vehicle share) | Crash rate instead of density; traffic in "risk now" | bgtoll.bg traffic passes | Data | Low | Density only (allowed by ДАБДП) |
| 11 | Vehicle types / HGV involvement, crash cause, surface, light | Better fix matching | Not in this export | — | Low | Night from sun position; weather from Open-Meteo |
| 12 | Asphalt temperature | Ice flag | bgtoll.bg/mto | Data | Low | Air temperature only |
| 13 | Live traffic + weather | "Risk now" layer | traffic.api.bg, bgtoll.bg, Open-Meteo forecast | Data/Frontend | Medium (demo) | Open-Meteo current weather only |
| 14 | Repairs | Mark recently fixed segments | roads.mrrb.bg | Data | Low | Skip |

---

## 6. Open questions

**For data (vl-vasilev)**
1. Where does `ptp_history_21to25.csv` come from, and is there a newer export (after April 2025, fewer missing coordinates in 2022–2023)?
2. Road network: АПИ or OSM? We need a road number and class on every line, plus km if possible.
3. Which DB are we using (PostGIS/Supabase or plain Parquet files)? The table design above works for both.
4. Repo rule says raw data is not committed. The CSV (24 MB) and PDFs (8 MB) are in the repo root. Suggest moving them to
   `data/raw/` (gitignored) and sharing through a drive link. Your call, since they're your files.

**For frontend (Viktor Nedev)**
5. The landing branch uses Mapbox GL. Final outputs will be GeoJSON in EPSG:4326: `segments_final.geojson`
   (one line per segment with scores, class, top 3 reasons, fixes) and `crashes.geojson` (points for the filters).
   Which folder should they go in?
