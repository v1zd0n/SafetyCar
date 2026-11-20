-- 11: cached live АПИ risk per section, so the backend reads it in milliseconds.
-- api.road_status_risk() (road-status-queries/install.sql) takes ~20 s for the whole network, so the live job
-- (infra/live/safetycar-live.sh, every 15 min) calls refresh_road_status() right after loading a new snapshot.
-- Needs: 10_sections.sql and road-status-queries/install.sql.
\set ON_ERROR_STOP on
begin;

create table if not exists road_status_current (
  vehicle text not null check (vehicle in ('car', 'heavy')),   -- heavy = over 3.5 t, mass unspecified
  section_id text not null,
  road text, carriageway text, km_from numeric, km_to numeric, length_m numeric,
  risk_score int, risk_level text, access_status text,
  oldest_publication_at timestamptz, events jsonb,
  refreshed_at timestamptz not null default now(),
  primary key (vehicle, section_id)
);

create or replace function refresh_road_status() returns int language plpgsql as $$
declare n int;
begin
  create temp table _car on commit drop as select * from api.road_status_risk(false, null, null);
  create temp table _heavy on commit drop as select * from api.road_status_risk(true, null, null);
  delete from road_status_current;
  insert into road_status_current (vehicle, section_id, road, carriageway, km_from, km_to, length_m,
                                   risk_score, risk_level, access_status, oldest_publication_at, events)
  select 'car', section_id, road, carriageway, km_from, km_to, length_m, risk_score, risk_level, access_status,
         oldest_publication_at, events from _car
  union all
  select 'heavy', section_id, road, carriageway, km_from, km_to, length_m, risk_score, risk_level, access_status,
         oldest_publication_at, events from _heavy;
  get diagnostics n = row_count;
  return n;
end $$;

-- Read side. Staleness is checked at read time: older than 45 min -> unknown (Goal.md, criterion 3).
-- For a specific mass (e.g. 18 t) call api.road_status_risk(true, 18, '<road>') directly (~1 s per road).
create or replace function api.road_status_current(vehicle_class text default 'car', road_filter text default null)
returns table (section_id text, road text, carriageway text, km_from numeric, km_to numeric, length_m numeric,
               risk_score int, risk_level text, access_status text, oldest_publication_at timestamptz,
               refreshed_at timestamptz, events jsonb, geom geometry)
language sql stable as $$
  select r.section_id, r.road, r.carriageway, r.km_from, r.km_to, r.length_m,
         case when fresh then r.risk_score end,
         case when fresh then r.risk_level else 'unknown' end,
         case when fresh then r.access_status else 'unknown' end,
         r.oldest_publication_at, r.refreshed_at, r.events, s.geom
  from road_status_current r
  join sections s using (section_id)
  cross join lateral (select r.oldest_publication_at > now() - interval '45 minutes' as fresh) f
  where r.vehicle = vehicle_class and (road_filter is null or r.road = road_filter)
$$;

-- Mapbox vector tile of the live layer: GET /tiles/live/{vehicle}/{z}/{x}/{y}.pbf
create or replace function api.road_status_mvt(z int, x int, y int, vehicle_class text default 'car')
returns bytea language sql stable as $$
  select st_asmvt(t, 'road_status', 4096, 'geom')
  from (
    select section_id, road, risk_score, risk_level, access_status,
           st_asmvtgeom(st_transform(geom, 3857), st_tileenvelope(z, x, y), 4096, 64, true) as geom
    from api.road_status_current(vehicle_class, null)
    where geom && st_transform(st_tileenvelope(z, x, y), 4326)
  ) t where geom is not null
$$;

grant select on road_status_current to safetycar_ro;
grant execute on function api.road_status_current(text, text), api.road_status_mvt(int, int, int, text) to safetycar_ro;
commit;
