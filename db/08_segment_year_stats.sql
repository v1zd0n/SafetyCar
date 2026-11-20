-- 08: segment_year_stats — one row per (segment, year), crashes outside settlements only. Spec: §3.6.
-- Segments with no crashes still get a row with zeros. Weather counts are NULL-safe (only crashes inside the weather period count).
\set ON_ERROR_STOP on
begin;
drop table if exists segment_year_stats cascade;
create table segment_year_stats as
with c as (
  select * from crashes where seg_id is not null and not in_settlement
)
select s.seg_id, y.year,
  count(c.crash_id)::int as n_crashes,
  count(*) filter (where c.severity = 'fatal')::int as n_fatal,
  count(*) filter (where c.severity = 'injury')::int as n_injury,
  count(*) filter (where c.severity = 'damage')::int as n_damage,
  coalesce(sum(c.n_killed), 0)::int as n_killed,
  coalesce(sum(c.n_injured), 0)::int as n_injured,
  coalesce(sum(c.epdo), 0)::int as epdo,
  count(*) filter (where c.is_night)::int as n_night,
  count(*) filter (where c.wx_fog)::int as n_fog,
  count(*) filter (where c.wx_rain_heavy)::int as n_rain,
  count(*) filter (where c.wx_ice)::int as n_ice,
  count(*) filter (where c.wx_wind_strong)::int as n_wind,
  count(*) filter (where c.type_group = 'rear_end')::int as n_rear_end,
  count(*) filter (where c.type_group = 'side')::int as n_side,
  count(*) filter (where c.type_group = 'angle')::int as n_angle,
  count(*) filter (where c.type_group = 'head_on')::int as n_head_on,
  count(*) filter (where c.type_group = 'run_off_road')::int as n_run_off_road,
  count(*) filter (where c.type_group = 'rollover')::int as n_rollover,
  count(*) filter (where c.type_group = 'pedestrian')::int as n_pedestrian,
  count(*) filter (where c.type_group = 'cyclist')::int as n_cyclist,
  count(*) filter (where c.type_group = 'parked')::int as n_parked,
  count(*) filter (where c.type_group = 'animal_cart')::int as n_animal_cart,
  count(*) filter (where c.type_group = 'obstacle')::int as n_obstacle,
  count(*) filter (where c.type_group = 'train')::int as n_train,
  count(*) filter (where c.type_group = 'other')::int as n_other
from segments s
cross join (select distinct year from crashes) y
left join c on c.seg_id = s.seg_id and c.year = y.year
group by 1, 2;
alter table segment_year_stats add primary key (seg_id, year);
comment on table segment_year_stats is 'Crash counts per segment and year, crashes outside settlements only (zeros included)';
commit;
analyze segment_year_stats;
select year, sum(n_crashes) as crashes, sum(n_fatal) as fatal, sum(n_injury) as injury, sum(n_fog) as fog
from segment_year_stats group by 1 order by 1;
