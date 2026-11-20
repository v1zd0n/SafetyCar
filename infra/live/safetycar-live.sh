#!/bin/sh
# Live refresh for SafetyCar (runs every 15 min from safetycar-live.timer, as user safetycar on wp-host).
# 1. download the latest АПИ DATEX II publications and store them (road-status-queries/fetch.mjs)
# 2. recompute the cached per-section risk (db/11_road_status_cache.sql: refresh_road_status())
# A failed download keeps the previous snapshot; the read side then reports "unknown" once it is 45 min old.
set -eu
DIR=/data/home/safetycar/live
PSQL="psql -h localhost -d safetycar -v ON_ERROR_STOP=1 -q"
cd "$DIR"
node fetch.mjs > snapshot.sql
$PSQL -f snapshot.sql
$PSQL -Atc "select 'refreshed ' || refresh_road_status() || ' rows'"
