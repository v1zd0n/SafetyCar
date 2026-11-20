-- 07: weather layer (PoC). Spec: docs/data-aggregation.md §3.6, simplified:
--   * cells are 1° x 1° (wx_cell_id = centre, e.g. '42.5_25.5'), only cells with crashes on national roads;
--   * period 2023-04-14 .. 2025-04-13 (last two years of the crash data); crashes outside it get NULL flags.
-- Run (on the server, as safetycar):
--   psql -d safetycar -Atc "select wx_cell_id, lat, lon from weather_cells_needed" > cells.txt
--   python3 scripts/fetch_weather.py cells.txt | psql -d safetycar -f db/07_weather.sql
\set ON_ERROR_STOP on
begin;

drop table if exists weather_hourly cascade;
create table weather_hourly (
  wx_cell_id text not null,
  ts_utc timestamptz not null,
  temperature_2m real, dew_point_2m real, precipitation real, snowfall real,
  wind_gusts_10m real, cloud_cover real, cloud_cover_low real,
  primary key (wx_cell_id, ts_utc)
);
\copy weather_hourly from pstdin with (format csv, header true)

-- flags (starting rules from the guidelines; tune here)
alter table weather_hourly add column wx_fog boolean, add column wx_rain_heavy boolean,
  add column wx_wind_strong boolean, add column wx_ice boolean;
with p95 as (
  select wx_cell_id, percentile_cont(0.95) within group (order by wind_gusts_10m) as g95
  from weather_hourly group by 1
),
prev6 as (
  select wx_cell_id, ts_utc,
         sum(coalesce(precipitation, 0) + coalesce(snowfall, 0))
           over (partition by wx_cell_id order by ts_utc rows between 6 preceding and 1 preceding) as wet6
  from weather_hourly
)
update weather_hourly w set
  wx_fog = w.cloud_cover_low >= 90 and w.temperature_2m - w.dew_point_2m <= 1,
  wx_rain_heavy = w.precipitation >= 2,
  wx_wind_strong = w.wind_gusts_10m > p95.g95,
  wx_ice = w.temperature_2m <= 2 and (w.cloud_cover <= 30 or prev6.wet6 > 0)
from p95, prev6
where p95.wx_cell_id = w.wx_cell_id and prev6.wx_cell_id = w.wx_cell_id and prev6.ts_utc = w.ts_utc;

-- denominator for the relative risk: hours per cell, year and condition
drop table if exists cell_condition_hours cascade;
create table cell_condition_hours as
select wx_cell_id, extract(year from ts_utc at time zone 'Europe/Sofia')::int as year, c.condition, count(*)::int as hours
from weather_hourly
cross join lateral (values ('all', true), ('fog', wx_fog), ('rain_heavy', wx_rain_heavy),
                           ('wind_strong', wx_wind_strong), ('ice', wx_ice)) as c(condition, flag)
where c.flag
group by 1, 2, 3;
alter table cell_condition_hours add primary key (wx_cell_id, year, condition);

-- crash flags: the crash's cell and hour
update crashes c set wx_fog = null, wx_rain_heavy = null, wx_wind_strong = null, wx_ice = null;
update crashes c set wx_fog = w.wx_fog, wx_rain_heavy = w.wx_rain_heavy, wx_wind_strong = w.wx_wind_strong, wx_ice = w.wx_ice
from weather_hourly w
where w.wx_cell_id = c.wx_cell_id and w.ts_utc = date_trunc('hour', c.ts_utc);

comment on table weather_hourly is 'ERA5 via Open-Meteo, 1° cells, 2023-04-14..2025-04-13 (PoC)';
commit;
analyze weather_hourly;

select condition, sum(hours) as hours from cell_condition_hours group by 1 order by 1;
select count(*) filter (where wx_fog is not null) as crashes_with_weather,
       count(*) filter (where wx_fog) as fog, count(*) filter (where wx_rain_heavy) as rain,
       count(*) filter (where wx_wind_strong) as wind, count(*) filter (where wx_ice) as ice
from crashes;
