-- Live layer: tables written by the pollers (backend/src/live), views and the "risk now" function per 3-km section.
-- Needs: db/01-09, analysis/run.py (schema analysis + api.segment_risk), road-status-queries/install.sql (vlado).
-- Idempotent: safe to run again.
begin;

create schema if not exists live;

-- raw feeds -------------------------------------------------------------------------------------------------------
create table if not exists live.weather (            -- Open-Meteo forecast API, one row per cell and fetch
  wx_cell_id text not null, fetched_at timestamptz not null, ts_utc timestamptz not null,
  temperature_2m real, dew_point_2m real, relative_humidity_2m real, precipitation real, precip_1h real,
  precip_6h real, rain real, snowfall real, weather_code int, cloud_cover real, cloud_cover_low real,
  visibility real, wind_gusts_10m real, is_day boolean,
  primary key (wx_cell_id, fetched_at));

create table if not exists live.station (            -- bgtoll.bg road weather stations (МТО)
  station_id int not null, ts_utc timestamptz not null, fetched_at timestamptz not null,
  name text, lat double precision, lon double precision, air real, surface real, humidity real, wind real,
  use_model boolean, status text,
  primary key (station_id, ts_utc));

create table if not exists live.traffic (            -- bgtoll.bg toll counters
  scp int not null, ts_utc timestamptz not null, fetched_at timestamptz not null,
  name text, lat double precision, lon double precision, count_15m int, count_1h int, speed_1h real,
  heavy_1h int, heavy_share real,
  primary key (scp, ts_utc));

create table if not exists live.warnings (           -- MeteoAlarm, Bulgaria; identifier = '<CAP id>:<NUTS3>'
  identifier text primary key, fetched_at timestamptz not null, nuts3 text, area text, event text,
  awareness_type text, level text, severity text, onset timestamptz, expires timestamptz, title text);

create table if not exists live.road_status_sections (   -- api.road_status_risk() for the whole network, per poll
  vehicle text not null, section_id text not null, road text, carriageway text, km_from numeric, km_to numeric,
  risk_score int, risk_level text, access_status text, oldest_publication_at timestamptz, events jsonb,
  computed_at timestamptz not null,
  primary key (vehicle, section_id));

create table if not exists live.feed_status (
  feed text primary key, last_ok timestamptz, last_error timestamptz, error text, rows int);

-- MeteoAlarm areas are NUTS3 codes; oblasts has OSM names
create table if not exists live.nuts3_oblast (nuts3 text primary key, oblast text not null);
insert into live.nuts3_oblast values
  ('BG311','Видин'),('BG312','Монтана'),('BG313','Враца'),('BG314','Плевен'),('BG315','Ловеч'),
  ('BG321','Велико Търново'),('BG322','Габрово'),('BG323','Русе'),('BG324','Разград'),('BG325','Силистра'),
  ('BG331','Варна'),('BG332','Добрич'),('BG333','Шумен'),('BG334','Търговище'),
  ('BG341','Бургас'),('BG342','Сливен'),('BG343','Ямбол'),('BG344','Стара Загора'),
  ('BG411','София-град'),('BG412','Софийска'),('BG413','Благоевград'),('BG414','Перник'),('BG415','Кюстендил'),
  ('BG421','Пловдив'),('BG422','Хасково'),('BG423','Пазарджик'),('BG424','Смолян'),('BG425','Кърджали')
on conflict (nuts3) do update set oblast = excluded.oblast;

-- current conditions -----------------------------------------------------------------------------------------------
-- strong wind = gusts above the cell's 95th percentile, same rule as db/07_weather.sql
create or replace view live.cell_gust_p95 as
select wx_cell_id, percentile_cont(0.95) within group (order by wind_gusts_10m) as gust_p95
from weather_hourly group by wx_cell_id;

-- latest reading per cell, whatever its age. status: ok (<= 90 min old) or stale; flags only when ok,
-- with the same rules as the historical ones (db/07_weather.sql). No row at all = "missing" (api.live_sections).
drop view if exists live.cell_conditions cascade;
create view live.cell_conditions as
select w.wx_cell_id, w.ts_utc, w.fetched_at, w.temperature_2m, w.dew_point_2m, w.precip_1h, w.wind_gusts_10m,
       w.cloud_cover_low, w.visibility, w.weather_code,
       case when w.fetched_at > now() - interval '90 minutes' then 'ok' else 'stale' end as status,
       case when w.fetched_at > now() - interval '90 minutes' then
         (w.cloud_cover_low >= 90 and w.temperature_2m - w.dew_point_2m <= 1) end as fog,
       case when w.fetched_at > now() - interval '90 minutes' then (w.precip_1h >= 2) end as rain_heavy,
       case when w.fetched_at > now() - interval '90 minutes' then (w.wind_gusts_10m > p.gust_p95) end as wind_strong,
       case when w.fetched_at > now() - interval '90 minutes' then
         (w.temperature_2m <= 2 and (w.cloud_cover <= 30 or w.precip_6h > 0)) end as ice
from (select distinct on (wx_cell_id) * from live.weather order by wx_cell_id, fetched_at desc) w
left join live.cell_gust_p95 p using (wx_cell_id);

create index if not exists weather_fetched_idx on live.weather (wx_cell_id, fetched_at desc);
create index if not exists station_ts_idx on live.station (station_id, ts_utc desc);

-- latest working reading per road weather station (max 90 min old).
-- Several stations send surface = 0.0 as "no value" (e.g. 0.0 °C asphalt at 19 °C air): treated as missing.
create or replace view live.station_now as
select distinct on (station_id) station_id, ts_utc, name, air,
       case when surface = 0 and air > 5 then null else surface end as surface, humidity, wind,
       st_transform(st_setsrid(st_point(lon, lat), 4326), 3035) as geom_m
from live.station
where ts_utc > now() - interval '90 minutes' and not coalesce(use_model, false) and coalesce(status, 'ok') = 'ok'
order by station_id, ts_utc desc;

create or replace view live.warnings_now as
select w.*, n.oblast,
       case when w.awareness_type ~* 'wind' then 'wind_strong'
            when w.awareness_type ~* 'fog' then 'fog'
            when w.awareness_type ~* 'snow|ice' then 'ice'
            when w.awareness_type ~* 'rain|thunder|flood' then 'rain_heavy' end as condition
from live.warnings w left join live.nuts3_oblast n using (nuts3)
where now() between coalesce(w.onset, '-infinity') and coalesce(w.expires, 'infinity');

-- 3-km sections: same grouping as api.road_status_risk (vlado): up to 3 consecutive segments.
-- The geometry part never changes between data loads, so it is a table (rebuilt by this script), not computed per request.
create table if not exists live.section_geo (
  section_id text primary key, road text, road_class text, carriageway text, part_no int, km_from numeric, km_to numeric,
  length_m numeric, oblast text, wx_cell_id text, seg_ids text[], geom geometry, mid_lon float8, mid_lat float8, mid_m geometry);
truncate live.section_geo;
insert into live.section_geo
select g.*, st_x(m.mid), st_y(m.mid), st_transform(m.mid, 3035)
from (
  select concat_ws(':', s.road, s.carriageway, s.part_no, (s.piece_no - 1) / 3 + 1) as section_id,
         s.road, s.road_class, s.carriageway, s.part_no, min(s.km_from), max(s.km_to), sum(s.length_m),
         mode() within group (order by s.oblast), mode() within group (order by s.wx_cell_id),
         array_agg(s.seg_id order by s.piece_no), st_makeline(s.geom order by s.piece_no) as geom
  from segments s group by s.road, s.road_class, s.carriageway, s.part_no, (s.piece_no - 1) / 3) g(section_id, road, road_class,
    carriageway, part_no, km_from, km_to, length_m, oblast, wx_cell_id, seg_ids, geom)
cross join lateral (select st_lineinterpolatepoint(st_linemerge(g.geom), 0.5) as mid) m;
create index if not exists section_geo_road_idx on live.section_geo (road);
create index if not exists section_geo_geom_gix on live.section_geo using gist (geom);
analyze live.section_geo;

-- nearest road weather station (<= 20 km) per section. Stations do not move: refreshed by the station poller
-- (refresh_section_station()) instead of a nearest-neighbour search for every section on every request.
create table if not exists live.section_station (section_id text primary key, station_id int not null, dist_m real);
create or replace function live.refresh_section_station() returns int language sql as $f$
  delete from live.section_station;
  with st as (select distinct on (station_id) station_id, st_transform(st_setsrid(st_point(lon, lat), 4326), 3035) as g
              from live.station where lon is not null order by station_id, ts_utc desc)
  insert into live.section_station
  select s.section_id, n.station_id, n.d from live.section_geo s
  cross join lateral (select st.station_id, st_distance(st.g, s.mid_m) as d from st
                      where st_dwithin(st.g, s.mid_m, 20000) order by st.g <-> s.mid_m limit 1) n;
  select count(*)::int from live.section_station;
$f$;
select live.refresh_section_station();

-- sections + baseline from the 1-km scores: length-weighted mean (the max made 37% of sections "very high"), max kept too
drop view if exists live.sections cascade;
create view live.sections as
select g.section_id, g.road, g.road_class, g.carriageway, g.km_from, g.km_to, g.length_m, g.oblast, g.wx_cell_id,
       sc.base_score, sc.base_score_max, sc.base_class, g.seg_ids, g.geom, g.mid_lon, g.mid_lat
from live.section_geo g
left join (
  select concat_ws(':', s.road, s.carriageway, s.part_no, (s.piece_no - 1) / 3 + 1) as section_id,
         round((sum(x.score * s.length_m) / nullif(sum(s.length_m) filter (where x.score is not null), 0))::numeric, 1)::float8 as base_score,
         max(x.score) as base_score_max, max(x.class) as base_class
  from segments s join analysis.segment_scores x using (seg_id)
  group by 1) sc using (section_id);

-- "risk now" per 3-km section ---------------------------------------------------------------------------------------
-- risk_now   = base score x multipliers of the conditions active now (api.weather_multipliers), max 100
-- live_score = the higher of risk_now and vlado's road status score (АПИ events); levels use vlado's scale
-- weather_status = ok / stale (latest reading > 90 min old: not used for conditions) / missing (no reading)
drop function if exists api.live_sections(boolean, text);
create function api.live_sections(is_heavy boolean default false, road_filter text default null)
returns table (
  section_id text, road text, road_class text, carriageway text, km_from numeric, km_to numeric, oblast text,
  base_score double precision, base_score_max double precision, base_class bigint, conditions text[], multiplier double precision,
  risk_now double precision, road_status_score int, road_status_level text, access_status text,
  events jsonb, warnings jsonb, weather jsonb, weather_status text, live_score double precision, live_level text,
  updated_at timestamptz, geom geometry)
language sql stable
set jit = off
as $$
  with sec as (
    select * from live.sections where road_filter is null or road = road_filter
  ), mult as (
    select condition, multiplier from api.weather_multipliers
  ), warn as (                                    -- active MeteoAlarm warnings, once per oblast
    select oblast, array_agg(distinct condition) filter (where condition is not null) as conds,
           jsonb_agg(jsonb_build_object('event', event, 'type', awareness_type, 'level', level,
                                        'title', title, 'onset', onset, 'expires', expires)) as list
    from live.warnings_now group by oblast
  ), st as (
    select ss.section_id, n.surface, n.name from live.section_station ss join live.station_now n using (station_id)
  ), cond as materialized (                       -- materialized: computed once per section
    select s.section_id,
           array_remove(array[
             case when c.fog or 'fog' = any (w.conds) then 'fog' end,
             case when c.rain_heavy or 'rain_heavy' = any (w.conds) then 'rain_heavy' end,
             case when c.wind_strong or 'wind_strong' = any (w.conds) then 'wind_strong' end,
             case when c.ice or st.surface <= 0 or 'ice' = any (w.conds) then 'ice' end,
             case when sun_elevation(now(), s.mid_lat, s.mid_lon) < -6 then 'night' end
           ], null) as conditions,
           coalesce(c.status, 'missing') as weather_status,
           jsonb_strip_nulls(jsonb_build_object(
             'status', coalesce(c.status, 'missing'),
             'temperature_2m', c.temperature_2m, 'visibility_m', c.visibility, 'wind_gusts_kmh', c.wind_gusts_10m,
             'precip_1h_mm', c.precip_1h, 'weather_code', c.weather_code, 'observed_at', c.ts_utc,
             'road_surface_c', st.surface, 'station', st.name)) as weather,
           case when c.status = 'ok' then c.fetched_at end as fetched_at,
           coalesce(w.list, '[]'::jsonb) as warnings
    from sec s
    left join live.cell_conditions c using (wx_cell_id)
    left join st using (section_id)
    left join warn w on w.oblast = s.oblast
  ), rs as (
    select r.*, r.oldest_publication_at > now() - interval '45 minutes' as fresh
    from live.road_status_sections r where r.vehicle = case when is_heavy then 'heavy' else 'car' end
  ), scored as materialized (                     -- the multiplier once per section, not once per use
    select s.*, c.conditions, c.weather, c.weather_status, c.fetched_at, c.warnings,
           coalesce(m.multiplier, 1.0) as multiplier,
           rs.risk_score, rs.risk_level, rs.access_status, rs.events, rs.fresh, rs.computed_at
    from sec s join cond c using (section_id) left join rs using (section_id)
    left join lateral (select exp(sum(ln(mult.multiplier))) as multiplier from mult
                       where mult.condition = any (c.conditions)) m on true
  ), lv as (
    select *, least(100, base_score * multiplier) as rn,
           greatest(least(100, base_score * multiplier), case when fresh then risk_score end) as ls
    from scored
  )
  select section_id, road, road_class, carriageway, km_from, km_to, oblast, base_score, base_score_max, base_class, conditions,
         round(multiplier::numeric, 3)::float8,
         round(rn::numeric, 1)::float8 as risk_now,
         case when fresh then risk_score end,
         case when fresh then risk_level else 'unknown' end,
         case when fresh then access_status else 'unknown' end,
         case when fresh then coalesce(events, '[]'::jsonb) else '[]'::jsonb end,
         warnings, weather, weather_status,
         round(ls::numeric, 1)::float8 as live_score,
         case when fresh and access_status = 'blocked' then 'blocked'
              when ls is null then 'unknown'
              when ls < 35 then 'low'
              when ls < 60 then 'moderate'
              when ls < 80 then 'high'
              else 'very_high' end,
         greatest(fetched_at, case when fresh then computed_at end),
         geom
  from lv
$$;


-- АПИ events as map points with an icon key (icons are drawn by the frontend)
create or replace view api.live_events as
select e.id, e.feed, e.type, e.subtype, e.road, e.description, e.starts_at, e.ends_at, e.conditions,
       case
         when e.feed = 'Accident' then 'accident'
         when e.feed = 'AccessRestrictions' then 'restriction'
         when e.feed = 'ReversibleLanes' then 'reversible'
         when e.feed = 'Visibility' then 'fog'
         when e.feed = 'Obstruction' then 'obstacle'
         when e.feed = 'PublicEvent' then 'event'
         when e.feed = 'SurfaceCondition' then 'surface'
         when e.conditions ?| array['ice','blackIce','freezingRain'] then 'ice'
         when e.conditions ?| array['snowDrifts','heavySnowfall','snowOnTheRoad'] then 'snow'
         when e.conditions ?| array['highWinds','strongWinds','veryStrongGusts'] then 'wind'
         when e.feed = 'Weather' then 'weather'
         when e.subtype in ('roadClosed', 'carriagewayClosures') then 'closure'
         when e.subtype in ('laneClosures', 'narrowLanes', 'lanesDeviated', 'contraflow') then 'lane_closure'
         when e.type = 'sitReroutingManagement' then 'detour'
         when e.type = 'sitSpeedManagement' then 'speed_limit'
         when e.feed = 'Maintenance' then 'roadworks'
         else 'info'
       end as icon,
       case when e.geometry ->> 'type' = 'Point' then st_setsrid(st_geomfromgeojson(e.geometry), 4326)
            else st_lineinterpolatepoint(st_setsrid(st_geomfromgeojson(e.geometry), 4326), 0.5) end as geom,
       st_setsrid(st_geomfromgeojson(e.geometry), 4326) as geom_full
from public.road_status_snapshot s
cross join lateral jsonb_to_recordset(s.payload -> 'events') as e(
  id text, feed text, type text, subtype text, conditions jsonb, starts_at timestamptz, ends_at timestamptz,
  description text, road text, geometry jsonb)
where (e.starts_at is null or e.starts_at <= now()) and (e.ends_at is null or e.ends_at > now());

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'safetycar_ro') then
    grant usage on schema live to safetycar_ro;
    grant select on all tables in schema live to safetycar_ro;
    grant select on all tables in schema api to safetycar_ro;
    grant execute on all functions in schema api to safetycar_ro;
  end if;
end $$;

commit;
