-- Risk along a route (docs/route-api.md): the 3-km sections a route drives on, with baseline class and live АПИ status.
-- Needs: db/01-09, analysis/run.py (analysis.segment_scores), backend/sql/live.sql (live.road_status_sections).
-- Idempotent. Used by POST /api/route (backend/src/route.mjs).
begin;

drop function if exists api.route_risk(text, boolean);
create function api.route_risk(route_geojson text, is_heavy boolean default false)
returns table (
  risk_id text, road text, level text, sections text[], from_frac float8, to_frac float8, length_km float8,
  base_class int, base_score float8, live_level text, oblast text, reasons jsonb, events jsonb, geometry json)
language sql stable
set jit = off
as $$
  with r as (
    select st_setsrid(st_geomfromgeojson(route_geojson), 4326) as g4,
           st_transform(st_setsrid(st_geomfromgeojson(route_geojson), 4326), 3035) as g
  ),
  -- the route cut into short pieces, so the spatial index on segments is selective
  -- (one long line has a bbox covering half the country)
  pieces as materialized (
    select st_subdivide(r.g, 16) as p from r
  ),
  near as materialized (
    select distinct s.seg_id, s.geom_m from segments s join pieces on st_dwithin(s.geom_m, pieces.p, 15)
  ),
  -- the sample-point test runs only on the segments near the route (materialized, or it runs on all 21k)
  onroute as materialized (
    select n.seg_id from near n
    where (select count(*) from generate_series(1, 9) i
           where exists (select 1 from pieces where st_dwithin(st_lineinterpolatepoint(n.geom_m, i / 10.0), pieces.p, 15))) >= 6
  ),
  -- segments the route drives along: >= 6 of 9 sample points of the segment within 15 m of the route
  -- (15 m keeps the other carriageway of a dual road out)
  seg as (
    select s.seg_id, s.road, s.oblast, s.length_m,
           concat_ws(':', s.road, s.carriageway, s.part_no, (s.piece_no - 1) / 3 + 1) as section_id,
           least(st_linelocatepoint(r.g, st_startpoint(s.geom_m)), st_linelocatepoint(r.g, st_endpoint(s.geom_m))) as f0,
           greatest(st_linelocatepoint(r.g, st_startpoint(s.geom_m)), st_linelocatepoint(r.g, st_endpoint(s.geom_m))) as f1,
           x.class, x.score, x.top_reasons
    from onroute o
    join segments s using (seg_id)
    cross join r
    left join analysis.segment_scores x using (seg_id)
  ),
  live as (
    select section_id, risk_level, events
    from live.road_status_sections
    where vehicle = case when is_heavy then 'heavy' else 'car' end
      and oldest_publication_at > now() - interval '45 minutes'
  ),
  sec as (
    select s.section_id, min(s.road) as road, mode() within group (order by s.oblast) as oblast,
           min(s.f0) as f0, max(s.f1) as f1, max(s.class)::int as base_class, max(s.score)::float8 as base_score,
           (array_agg(s.top_reasons order by s.score desc nulls last))[1] as reasons,
           l.risk_level as live_level, coalesce(l.events, '[]'::jsonb) as events
    from seg s left join live l using (section_id)
    group by s.section_id, l.risk_level, l.events
  ),
  lev as (
    select *,
      case when base_class >= 4 or live_level in ('high', 'very_high', 'blocked') then 'high'
           when base_class = 3 or live_level = 'moderate' then 'medium'
           else 'low' end as level
    from sec
  ),
  -- consecutive sections of the same road and level become one risk item
  grp as (
    select *, sum(brk) over (order by f0) as grp_no
    from (select *, case when lag(road) over (order by f0) = road and lag(level) over (order by f0) = level
                              and f0 - lag(f1) over (order by f0) < 0.01 then 0 else 1 end as brk
          from lev) b
  )
  select concat_ws(':', min(g.road), min(g.f0)::numeric(6, 4)) as risk_id, min(g.road), min(g.level),
         array_agg(g.section_id order by g.f0), min(g.f0), max(g.f1),
         round((st_length(st_linesubstring(r.g4, min(g.f0), max(g.f1))::geography) / 1000)::numeric, 1)::float8,
         max(g.base_class), max(g.base_score), max(g.live_level), mode() within group (order by g.oblast),
         (array_agg(g.reasons order by g.base_score desc nulls last))[1],
         coalesce((select jsonb_agg(distinct e) from grp g2, jsonb_array_elements(g2.events) e
                   where g2.grp_no = g.grp_no), '[]'::jsonb),
         st_asgeojson(st_linesubstring(r.g4, min(g.f0), max(g.f1)), 6)::json
  from grp g cross join r
  where g.level <> 'low'
  group by g.grp_no, r.g4
  order by min(g.f0)
$$;

-- cities and towns for the start/end fields of /demo (GET /api/places); the API role has no access to schema osm
drop table if exists api.places;
create table api.places as
select distinct on (p.name) p.name, p.place,
       round(st_x(p.geom)::numeric, 5)::float8 as lon, round(st_y(p.geom)::numeric, 5)::float8 as lat
from osm.places p
where p.place in ('city', 'town') and p.name is not null
  and st_intersects(p.geom, (select geom from osm.admin where admin_level = 2 and name = 'България' limit 1))
order by p.name, case p.place when 'city' then 1 else 2 end;

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'safetycar_ro') then
    grant select on api.places to safetycar_ro;
    grant execute on function api.route_risk(text, boolean) to safetycar_ro;
  end if;
end $$;
commit;
