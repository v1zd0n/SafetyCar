#!/usr/bin/env bash
# Rebuild the whole SafetyCar database on wp-host from scratch (as the safetycar user, in /data/home/safetycar/import).
# Inputs in that folder: crash_rows.csv (scripts/prepare_crash_rows.py), osm/bulgaria.osm.pbf, the db/*.sql files,
# safetycar.lua and fetch_weather.py. Total ~25 min (OSM import ~10 min, weather ~3 min).
set -euo pipefail
cd /data/home/safetycar/import
P="psql -h localhost -d safetycar -q -v ON_ERROR_STOP=1"

$P -f 01_crash_rows.sql < crash_rows.csv
$P -f 02_crashes.sql
$P -c "create schema if not exists osm"
osm2pgsql -H localhost -d safetycar -U safetycar -O flex -S osm/safetycar.lua --cache 3000 osm/bulgaria.osm.pbf
$P -f 03_areas.sql
$P -f 04_segments.sql
$P -f 05_snap.sql
$P -f 06_segment_features.sql
$P -f 07a_weather_cells.sql
psql -h localhost -d safetycar -Atc "select wx_cell_id, lat, lon from weather_cells_needed" | tr '|' ' ' > cells.txt
python3 -I fetch_weather.py cells.txt | $P -f 07_weather.sql
$P -f 08_segment_year_stats.sql
$P -f 09_api.sql
