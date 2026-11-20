-- 09: read-only access for the backend + ready-made views and vector-tile functions in schema "api".
-- The backend runs on wp-host and connects to localhost:5432/safetycar as role safetycar_ro.
-- The role is created once by an admin (the safetycar owner may not create roles):
--   sudo -u postgres psql -c "create role safetycar_ro login password '<random>'"
-- Its connection string lives on the server in /data/home/safetycar/backend.env (mode 600), never in git.
\set ON_ERROR_STOP on
begin;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'safetycar_ro') then
    raise exception 'role safetycar_ro is missing: create it as postgres first (see the header of this file)';
  end if;
end $$;

create schema if not exists api;

-- segments with everything the map needs (scores are added by the analysis later)
create or replace view api.segments as
select s.seg_id, s.road, s.road_class, s.carriageway, s.km_from, s.km_to, s.length_m,
       s.oblast, s.municipality, s.settlement, s.settlement_share, s.in_settlement, s.wx_cell_id,
       f.lanes, f.lane_width_m, f.speed_limit, f.curvature_deg_per_km, f.min_radius_m,
       f.access_per_km, f.junctions_per_km, f.crossings_per_km, f.roadside_obstacle_share,
       f.shoulder_type, f.has_sidewalk, f.has_overtaking_lane, f.is_divided, f.is_lit,
       coalesce(t.n_crashes, 0) as n_crashes_2021_2024, coalesce(t.n_fatal, 0) as n_fatal_2021_2024,
       coalesce(t.n_injury, 0) as n_injury_2021_2024, coalesce(t.n_killed, 0) as n_killed_2021_2024,
       coalesce(t.epdo, 0) as epdo_2021_2024,
       round((coalesce(t.n_fatal, 0) + coalesce(t.n_injury, 0)) / 4.0 / greatest(s.length_m, 1) * 1000, 3)
         as serious_per_km_year,
       s.geom
from segments s
left join segment_features f using (seg_id)
left join (select seg_id, sum(n_crashes) n_crashes, sum(n_fatal) n_fatal, sum(n_injury) n_injury,
                  sum(n_killed) n_killed, sum(epdo) epdo
           from segment_year_stats where year between 2021 and 2024 group by 1) t using (seg_id);

-- crash points for the map filters (only crashes on the national network, like the plan says)
create or replace view api.crashes as
select crash_id, ts_local, year, month, hour, dow, type_raw, type_group, severity, epdo, n_persons, n_killed, n_injured,
       is_night, in_settlement, settlement, oblast, municipality, seg_id, snap_dist_m, loc_quality,
       wx_fog, wx_rain_heavy, wx_wind_strong, wx_ice, geom
from crashes where seg_id is not null;

-- Mapbox vector tiles: GET /tiles/segments/{z}/{x}/{y}.pbf -> select api.segments_mvt(z, x, y)
create or replace function api.segments_mvt(z int, x int, y int) returns bytea
language sql stable parallel safe as $$
  select st_asmvt(t, 'segments', 4096, 'geom')
  from (
    select seg_id, road, road_class, carriageway, in_settlement, serious_per_km_year, n_fatal_2021_2024,
           n_injury_2021_2024, speed_limit,
           st_asmvtgeom(st_transform(geom, 3857), st_tileenvelope(z, x, y), 4096, 64, true) as geom
    from api.segments
    where geom && st_transform(st_tileenvelope(z, x, y), 4326)
      and (z >= 9 or road_class in ('A', 'I', 'II'))
      and (z >= 7 or road_class in ('A', 'I'))
  ) t where geom is not null
$$;

create or replace function api.crashes_mvt(z int, x int, y int, from_year int default 2021, to_year int default 2025)
returns bytea language sql stable parallel safe as $$
  select st_asmvt(t, 'crashes', 4096, 'geom')
  from (
    select crash_id, year, hour, type_group, severity, is_night, in_settlement, wx_fog, wx_rain_heavy, wx_ice, wx_wind_strong,
           st_asmvtgeom(st_transform(geom, 3857), st_tileenvelope(z, x, y), 4096, 64, true) as geom
    from api.crashes
    where geom && st_transform(st_tileenvelope(z, x, y), 4326)
      and year between from_year and to_year
      and (z >= 10 or severity <> 'damage')
  ) t where geom is not null
$$;

-- GeoJSON FeatureCollection for one road or a bounding box (small areas only)
create or replace function api.segments_geojson(min_lon float8, min_lat float8, max_lon float8, max_lat float8)
returns json language sql stable as $$
  select json_build_object('type', 'FeatureCollection', 'features', coalesce(json_agg(st_asgeojson(s.*)::json), '[]'::json))
  from api.segments s where s.geom && st_makeenvelope(min_lon, min_lat, max_lon, max_lat, 4326)
$$;

grant usage on schema public, api to safetycar_ro;
grant select on all tables in schema public to safetycar_ro;
grant select on all tables in schema api to safetycar_ro;
grant execute on all functions in schema api to safetycar_ro;
alter default privileges in schema public grant select on tables to safetycar_ro;
alter default privileges in schema api grant select on tables to safetycar_ro;
revoke all on schema osm from safetycar_ro;
commit;
select count(*) as api_segments from api.segments;
select length(api.segments_mvt(7, 72, 47)) as tile_bytes_sofia_z7;
