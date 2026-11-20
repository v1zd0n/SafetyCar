-- 10: the shared ~3 km section network (docs/Goal.md, criterion 1).
-- A section = up to 3 consecutive 1 km segments of the same road, carriageway and OSM part;
-- section_id has the same format as api.road_status_risk (road-status-queries/install.sql):
--   <road>:<carriageway>:<part_no>:<section_no>, e.g. A1:dual:1:19.
-- Adds section_id to segments and crashes, and per-section crash stats. Additive: nothing existing is renamed.
\set ON_ERROR_STOP on
begin;

alter table segments add column if not exists section_id text;
update segments set section_id = concat_ws(':', road, carriageway, part_no, (piece_no - 1) / 3 + 1);
create index if not exists segments_section_idx on segments (section_id);

drop table if exists sections cascade;
create table sections as
select section_id, road, min(road_class) as road_class, carriageway, part_no,
       ((min(piece_no) - 1) / 3 + 1)::int as section_no,
       min(km_from) as km_from, max(km_to) as km_to, round(sum(length_m), 1) as length_m,
       count(*)::int as n_segments,
       array_agg(seg_id order by piece_no) as seg_ids,
       round((sum(settlement_share * length_m) / sum(length_m))::numeric, 3) as settlement_share,
       mode() within group (order by oblast) as oblast,
       mode() within group (order by municipality) as municipality,
       st_linemerge(st_collect(geom order by piece_no))::geometry(Geometry, 4326) as geom,
       st_linemerge(st_collect(geom_m order by piece_no))::geometry(Geometry, 3035) as geom_m
from segments
group by section_id, road, carriageway, part_no;
alter table sections add primary key (section_id);
alter table sections add column in_settlement boolean;
update sections set in_settlement = settlement_share > 0.5;
create index sections_geom_gix on sections using gist (geom);
create index sections_geom_m_gix on sections using gist (geom_m);
create index sections_road_idx on sections (road);

alter table crashes add column if not exists section_id text;
update crashes c set section_id = s.section_id from segments s where s.seg_id = c.seg_id;
update crashes set section_id = null where seg_id is null;
create index if not exists crashes_section_idx on crashes (section_id);

-- per section and year, crashes outside settlements (sum of the segment rows)
drop table if exists section_year_stats cascade;
create table section_year_stats as
select s.section_id, y.year,
       sum(y.n_crashes)::int n_crashes, sum(y.n_fatal)::int n_fatal, sum(y.n_injury)::int n_injury,
       sum(y.n_damage)::int n_damage, sum(y.n_killed)::int n_killed, sum(y.n_injured)::int n_injured,
       sum(y.epdo)::int epdo, sum(y.n_night)::int n_night, sum(y.n_fog)::int n_fog, sum(y.n_rain)::int n_rain,
       sum(y.n_ice)::int n_ice, sum(y.n_wind)::int n_wind,
       sum(y.n_rear_end)::int n_rear_end, sum(y.n_side)::int n_side, sum(y.n_angle)::int n_angle,
       sum(y.n_head_on)::int n_head_on, sum(y.n_run_off_road)::int n_run_off_road, sum(y.n_rollover)::int n_rollover,
       sum(y.n_pedestrian)::int n_pedestrian, sum(y.n_cyclist)::int n_cyclist, sum(y.n_parked)::int n_parked,
       sum(y.n_animal_cart)::int n_animal_cart, sum(y.n_obstacle)::int n_obstacle, sum(y.n_train)::int n_train,
       sum(y.n_other)::int n_other
from segment_year_stats y join segments s using (seg_id)
group by 1, 2;
alter table section_year_stats add primary key (section_id, year);

create or replace view api.sections as
select s.section_id, s.road, s.road_class, s.carriageway, s.km_from, s.km_to, s.length_m, s.n_segments, s.seg_ids,
       s.oblast, s.municipality, s.settlement_share, s.in_settlement,
       coalesce(t.n_crashes, 0) as n_crashes_2021_2024, coalesce(t.n_fatal, 0) as n_fatal_2021_2024,
       coalesce(t.n_injury, 0) as n_injury_2021_2024, coalesce(t.n_killed, 0) as n_killed_2021_2024,
       coalesce(t.epdo, 0) as epdo_2021_2024,
       round((coalesce(t.n_fatal, 0) + coalesce(t.n_injury, 0)) / 4.0 / greatest(s.length_m, 1) * 1000, 3) as serious_per_km_year,
       s.geom
from sections s
left join (select section_id, sum(n_crashes) n_crashes, sum(n_fatal) n_fatal, sum(n_injury) n_injury,
                  sum(n_killed) n_killed, sum(epdo) epdo
           from section_year_stats where year between 2021 and 2024 group by 1) t using (section_id);

comment on table sections is 'Shared ~3 km sections (3 consecutive segments); same section_id as api.road_status_risk';
grant select on sections, section_year_stats, api.sections to safetycar_ro;
commit;
analyze sections;
select road_class, carriageway, count(*) sections, round(avg(length_m)) avg_m from sections group by 1, 2 order by 1, 2;
