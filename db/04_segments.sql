-- 04: national road network -> ~1 km segments. Spec: docs/data-aggregation.md §3.3.
-- Road class from the OSM ref: "A 1" -> A1 (motorway), 1 digit -> class I, 2 digits -> II, 3–4 digits -> III.
-- Municipal roads (ref like SZR1060) and roads without a ref are not part of the network.
-- Dual carriageways (motorways, oneway ways) are segmented per carriageway: carriageway = 'dual'.
-- km_from / km_to are metres along the merged OSM line part (part_no), NOT official АПИ kilometres.
\set ON_ERROR_STOP on
begin;

create or replace function national_road(ref text, out road text, out road_class text, out class_rank int)
language sql immutable as $$
  with r as (
    select x, case
      when x ~ '^[AАaа][0-9]+$' then 'A'
      when x ~ '^[0-9]$' then 'I'
      when x ~ '^[0-9]{2}$' then 'II'
      when x ~ '^[0-9]{3,4}$' then 'III'
    end as c
    from unnest(string_to_array(replace(coalesce(ref, ''), ' ', ''), ';')) as x
  )
  select case c when 'A' then 'A' || regexp_replace(x, '\D', '', 'g') else c || '-' || x end, c,
         case c when 'A' then 0 when 'I' then 1 when 'II' then 2 else 3 end
  from r where c is not null
  order by 3, length(x), x limit 1
$$;

drop table if exists road_ways cascade;
create table road_ways as
select w.way_id, w.highway, w.ref, w.name, w.tags, nr.road, nr.road_class,
       (coalesce(w.oneway, '') in ('yes', '1', '-1') or (w.highway = 'motorway' and coalesce(w.oneway, '') <> 'no')) as is_oneway,
       st_transform(w.geom, 3035)::geometry(LineString, 3035) as geom_m
from osm.highways w
cross join lateral national_road(w.ref) nr
where nr.road is not null
  and w.highway in ('motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'living_street', 'road')
  and coalesce(w.tags ->> 'access', '') not in ('no', 'private');
create index road_ways_gix on road_ways using gist (geom_m);

drop table if exists road_parts cascade;
create table road_parts as
with merged as (
  select road, road_class, is_oneway, (st_dump(st_linemerge(st_collect(geom_m)))).geom as g
  from road_ways group by 1, 2, 3
)
select road, road_class, is_oneway,
       row_number() over (partition by road, is_oneway order by st_length(g) desc)::int as part_no,
       g::geometry(LineString, 3035) as geom_m
from merged where st_length(g) >= 100;

drop table if exists segments cascade;
create table segments as
with p as (
  select *, st_length(geom_m) as len, greatest(1, round(st_length(geom_m) / 1000))::int as n from road_parts
),
s as (
  select p.*, i,
         st_linesubstring(geom_m, i::float8 / n, (i + 1)::float8 / n) as g
  from p cross join lateral generate_series(0, p.n - 1) as i
)
select road || ':' || case when is_oneway then 'd' else 's' end || lpad(part_no::text, 2, '0') || ':' || lpad((i + 1)::text, 3, '0') as seg_id,
       road, road_class,
       case when is_oneway then 'dual' else 'single' end as carriageway,
       part_no, (i + 1) as piece_no,
       round((len * i / n)::numeric / 1000, 3) as km_from,
       round((len * (i + 1) / n)::numeric / 1000, 3) as km_to,
       round(st_length(g)::numeric, 1) as length_m,
       g::geometry(LineString, 3035) as geom_m
from s;
alter table segments add primary key (seg_id);
create index segments_gix on segments using gist (geom_m);

alter table segments add column geom geometry(LineString, 4326);
update segments set geom = st_transform(geom_m, 4326);
create index segments_geom_gix on segments using gist (geom);

-- location attributes
alter table segments add column oblast text, add column municipality text, add column wx_cell_id text,
  add column settlement_share real, add column in_settlement boolean, add column settlement text, add column highway text;

update segments s set
  oblast = (select o.name from oblasts o where st_intersects(o.geom_m, st_lineinterpolatepoint(s.geom_m, 0.5)) limit 1),
  municipality = (select m.name from municipalities m where st_intersects(m.geom_m, st_lineinterpolatepoint(s.geom_m, 0.5)) limit 1),
  highway = (select w.highway from road_ways w where w.road = s.road
             order by w.geom_m <-> st_lineinterpolatepoint(s.geom_m, 0.5) limit 1);
-- wx_cell_id is set in 07a_weather_cells.sql

-- share of the length inside settlements: sample a point every 25 m
with pts as (
  select seg_id, (st_dump(st_lineinterpolatepoints(geom_m, least(1.0, 25.0 / greatest(length_m, 25))))).geom as pt
  from segments
),
sh as (
  select seg_id, avg((exists (select 1 from settlements st where st_intersects(st.geom_m, pts.pt)))::int) as share
  from pts group by seg_id
)
update segments s set settlement_share = round(sh.share, 3), in_settlement = sh.share > 0.5
from sh where sh.seg_id = s.seg_id;

update segments s set settlement = (
  select st.name from settlements st where st.geom_m && s.geom_m and st_intersects(st.geom_m, s.geom_m)
  order by st_length(st_intersection(st.geom_m, s.geom_m)) desc limit 1
) where settlement_share > 0;

comment on table segments is 'National roads (A, I, II, III) cut into ~1 km pieces from OSM. See docs/database.md';
commit;
analyze segments;

select road_class, carriageway, count(*) as segments, round(sum(length_m) / 1000) as km,
       round(sum(length_m) filter (where not in_settlement) / 1000) as km_outside
from segments group by 1, 2 order by 1, 2;
