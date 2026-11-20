-- Analysis results for the backend, in schema "api". Applied by analysis/run.py after every analysis run
-- (the analysis tables are rebuilt, which drops these views). Does not change anything from db/09_api.sql.
begin;

create schema if not exists api;

-- one row per segment: location + scores + reasons + fixes
create or replace view api.segment_risk as
select s.seg_id, s.road, s.road_class, s.carriageway, s.part_no, s.piece_no, s.km_from, s.km_to, s.length_m,
       s.oblast, s.municipality, s.settlement, s.in_settlement, s.wx_cell_id,
       x.assessed, x.class, x.priority, x.score, x.priority_rank, x.reactive_level, x.reactive_pct,
       x.proactive_level, x.proactive_s, x.proactive_pct, x.dominant_type, x.weather_factor, x.weather_rr,
       x.top_reasons, x.fixes,
       r.n_crashes, r.n_serious, r.n_fatal, r.n_killed, r.expected as expected_serious, r.eb_estimate,
       r.excess, r.serious_per_km_year,
       s.geom
from segments s
join analysis.segment_scores x using (seg_id)
join analysis.reactive r using (seg_id);

-- Mapbox vector tile, layer "risk". Thinned like api.segments_mvt (z < 7: A and I, z < 9: + II).
create or replace function api.segment_risk_mvt(z int, x int, y int) returns bytea
language sql stable parallel safe as $$
  select st_asmvt(t, 'risk', 4096, 'geom')
  from (
    select seg_id, road, road_class, carriageway, in_settlement, class, score, reactive_pct, proactive_pct,
           reactive_level, proactive_level, n_serious, n_fatal, top_reasons -> 0 ->> 'key' as top_reason,
           st_asmvtgeom(st_transform(geom, 3857), st_tileenvelope(z, x, y), 4096, 64, true) as geom
    from api.segment_risk
    where geom && st_transform(st_tileenvelope(z, x, y), 4326)
      and (z >= 9 or road_class in ('A', 'I', 'II'))
      and (z >= 7 or road_class in ('A', 'I'))
  ) t where geom is not null
$$;

-- condition multipliers for "risk now" (country-wide, all crashes)
create or replace view api.weather_multipliers as
select condition, observed, expected, rr, ci_low, ci_high, multiplier
from analysis.weather_rr where scope = 'all';

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'safetycar_ro') then
    grant usage on schema api, analysis to safetycar_ro;
    grant select on all tables in schema api to safetycar_ro;
    grant select on all tables in schema analysis to safetycar_ro;
    grant execute on all functions in schema api to safetycar_ro;
  end if;
end $$;

commit;
