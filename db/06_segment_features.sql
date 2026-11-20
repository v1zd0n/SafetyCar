-- 06: segment_features — raw values for the proactive score (one column per ДАБДП element + *_imputed).
-- Spec: docs/data-aggregation.md §3.5. Values only; CMF/RF conversion belongs to the analysis.
-- Way tags (lanes, width, maxspeed, lit, sidewalk, shoulder) come from the OSM way at the segment midpoint.
-- Missing values are imputed (class defaults below) and flagged with *_imputed = true.
\set ON_ERROR_STOP on
begin;

-- every other road as 3035, for junction / access counting
drop table if exists ways_m;
create temp table ways_m as
select w.way_id, w.highway, nr.road,
       (coalesce(w.tags ->> 'bridge', 'no') <> 'no' or coalesce(w.tags ->> 'tunnel', 'no') <> 'no') as grade_sep,
       st_transform(w.geom, 3035) as geom_m
from osm.highways w left join lateral national_road(w.ref) nr on true
where w.highway in ('motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'motorway_link', 'trunk_link',
                    'primary_link', 'secondary_link', 'tertiary_link', 'unclassified', 'residential',
                    'living_street', 'service', 'track', 'road');
create index on ways_m using gist (geom_m);
analyze ways_m;

-- forests and buildings close to national roads, cut into small pieces for fast distance tests
drop table if exists obstacles_m;
create temp table obstacles_m as
select a.kind, st_subdivide(st_transform(a.geom, 3035), 128) as geom_m
from osm.areas a
where a.kind in ('forest', 'building')
  and exists (select 1 from road_ways r where st_dwithin(r.geom_m, st_transform(a.geom, 3035), 15));
create index on obstacles_m using gist (geom_m);
analyze obstacles_m;

drop table if exists segment_features cascade;
create table segment_features as
with mid as (
  select s.seg_id, s.road, s.road_class, s.carriageway, s.in_settlement, s.length_m, s.geom_m,
         (select w.tags from road_ways w where w.road = s.road
          order by w.geom_m <-> st_lineinterpolatepoint(s.geom_m, 0.5) limit 1) as t
  from segments s
),
tagged as (
  select m.*,
    nullif(substring(t ->> 'lanes' from '^\d+'), '')::int as lanes_t,
    nullif(substring(coalesce(t ->> 'width', t ->> 'est_width') from '^\d+(\.\d+)?'), '')::real as width_t,
    nullif(substring(t ->> 'maxspeed' from '^\d+'), '')::int as maxspeed_t,
    greatest(nullif(substring(t ->> 'lanes:forward' from '^\d+'), '')::int,
             nullif(substring(t ->> 'lanes:backward' from '^\d+'), '')::int) as lanes_dir_t,
    t ->> 'lit' as lit_t,
    coalesce(t ->> 'sidewalk', t ->> 'sidewalk:both', t ->> 'sidewalk:left', t ->> 'sidewalk:right') as sidewalk_t,
    coalesce(t ->> 'shoulder', t ->> 'shoulder:left', t ->> 'shoulder:right') as shoulder_t,
    t ->> 'divider' as divider_t,
    t ->> 'surface' as surface_t
  from mid m
)
select seg_id, road_class,
  -- 1 lane width
  coalesce(lanes_t, case when carriageway = 'dual' then 2 else 2 end) as lanes,
  lanes_t is null as lanes_imputed,
  round(coalesce(width_t / nullif(coalesce(lanes_t, 2), 0),
                 case road_class when 'A' then 3.75 when 'I' then 3.5 when 'II' then 3.25 else 3.0 end)::numeric, 2) as lane_width_m,
  width_t is null as lane_width_imputed,
  -- 7 shoulder
  case when shoulder_t = 'no' then 'none' when shoulder_t is not null then 'paved'
       when road_class in ('A', 'I') then 'paved' else 'unpaved' end as shoulder_type,
  shoulder_t is null as shoulder_imputed,
  -- 8 overtaking lanes
  case when carriageway = 'dual' then false
       when lanes_t >= 3 or lanes_dir_t >= 2 then true else false end as has_overtaking_lane,
  carriageway <> 'dual' and lanes_t is null and lanes_dir_t is null as overtaking_imputed,
  -- 6 pedestrians
  case when sidewalk_t in ('no', 'none') then false when sidewalk_t is not null then true else in_settlement end as has_sidewalk,
  sidewalk_t is null as sidewalk_imputed,
  -- 9 signs and markings: no public source
  null::real as marking_quality,
  true as marking_imputed,
  -- extras
  coalesce(maxspeed_t, case when road_class = 'A' then 140 when carriageway = 'dual' then 120
                            when in_settlement then 50 else 90 end) as speed_limit,
  maxspeed_t is null as speed_limit_imputed,
  (carriageway = 'dual' or divider_t is not null and divider_t <> 'no') as is_divided,
  case when lit_t = 'yes' then true when lit_t = 'no' then false else in_settlement end as is_lit,
  lit_t is null or lit_t not in ('yes', 'no') as lit_imputed,
  surface_t as surface
from tagged;
alter table segment_features add primary key (seg_id);

-- 2 roadside: share of 50 m sample points with forest or a building within 10 m
alter table segment_features add column roadside_obstacle_share real, add column roadside_forest_share real,
  add column roadside_building_share real;
with pts as (
  select seg_id, (st_dump(st_lineinterpolatepoints(geom_m, least(1.0, 50.0 / greatest(length_m, 50))))).geom as pt
  from segments
),
f as (
  select seg_id,
    avg((exists (select 1 from obstacles_m o where o.kind = 'forest' and st_dwithin(o.geom_m, pts.pt, 10)))::int) as forest,
    avg((exists (select 1 from obstacles_m o where o.kind = 'building' and st_dwithin(o.geom_m, pts.pt, 10)))::int) as building,
    avg((exists (select 1 from obstacles_m o where st_dwithin(o.geom_m, pts.pt, 10)))::int) as any_
  from pts group by seg_id
)
update segment_features sf set roadside_obstacle_share = round(f.any_, 3), roadside_forest_share = round(f.forest, 3),
       roadside_building_share = round(f.building, 3)
from f where f.seg_id = sf.seg_id;

-- 3 curvature: total heading change per km and the smallest radius (geometry simplified to 5 m)
alter table segment_features add column curvature_deg_per_km real, add column min_radius_m real;
with v as (
  select seg_id, length_m, (dp).path[1] as i, (dp).geom as p
  from (select seg_id, length_m, st_dumppoints(st_simplifypreservetopology(geom_m, 5)) as dp from segments) d
),
w as (
  select seg_id, length_m, p, lag(p) over o as p0, lead(p) over o as p2 from v window o as (partition by seg_id order by i)
),
c as (
  select seg_id, length_m,
    abs(degrees(atan2(sin(st_azimuth(p, p2) - st_azimuth(p0, p)), cos(st_azimuth(p, p2) - st_azimuth(p0, p))))) as turn,
    case when st_distance(p0, p) >= 20 and st_distance(p, p2) >= 20
              and st_area(st_makepolygon(st_makeline(array[p0, p, p2, p0]))) > 0.01
         then st_distance(p0, p) * st_distance(p, p2) * st_distance(p0, p2)
              / (4 * st_area(st_makepolygon(st_makeline(array[p0, p, p2, p0])))) end as r
  from w where p0 is not null and p2 is not null and not st_equals(p0, p) and not st_equals(p, p2)
)
update segment_features sf set curvature_deg_per_km = round((x.turn / greatest(x.length_m, 1) * 1000)::numeric, 1),
                               min_radius_m = round(least(x.r, 10000)::numeric)
from (select seg_id, max(length_m) as length_m, sum(turn) as turn, min(r) as r from c group by seg_id) x
where x.seg_id = sf.seg_id;
update segment_features set curvature_deg_per_km = coalesce(curvature_deg_per_km, 0), min_radius_m = coalesce(min_radius_m, 10000);

-- 4 access points and 5 junctions: crossings with other roads (points closer than 25 m count once).
-- Bridges/tunnels are skipped (no access from an overpass).
alter table segment_features add column access_per_km real, add column junctions_per_km real,
  add column n_access int, add column n_junctions int;
with x as (
  select s.seg_id, s.length_m,
         case when w.highway in ('service', 'track', 'unclassified', 'residential', 'living_street', 'road') then 'access' else 'junction' end as kind,
         (st_dump(st_intersection(s.geom_m, w.geom_m))).geom as pt
  from segments s
  join ways_m w on st_intersects(s.geom_m, w.geom_m)
  where coalesce(w.road, '') <> s.road and not w.grade_sep
),
cl as (
  select seg_id, length_m, kind, st_clusterdbscan(pt, 25, 1) over (partition by seg_id, kind) as cid from x
  where geometrytype(pt) = 'POINT'
),
n as (
  select seg_id, max(length_m) as length_m,
         count(distinct cid) filter (where kind = 'access') as na, count(distinct cid) filter (where kind = 'junction') as nj
  from cl group by seg_id
)
update segment_features sf set n_access = n.na, n_junctions = n.nj,
  access_per_km = round((n.na / greatest(n.length_m, 1) * 1000)::numeric, 2),
  junctions_per_km = round((n.nj / greatest(n.length_m, 1) * 1000)::numeric, 2)
from n where n.seg_id = sf.seg_id;
update segment_features set n_access = coalesce(n_access, 0), n_junctions = coalesce(n_junctions, 0),
  access_per_km = coalesce(access_per_km, 0), junctions_per_km = coalesce(junctions_per_km, 0);

-- 6 pedestrian crossings and other point features within 15 m
alter table segment_features add column crossings_per_km real, add column n_crossings int, add column n_traffic_signals int,
  add column n_bus_stops int, add column n_level_crossings int;
with p as (
  select s.seg_id, s.length_m, rp.kind
  from segments s join osm.road_points rp
    on st_dwithin(s.geom_m, st_transform(rp.geom, 3035), 15)
   and rp.geom && st_expand(s.geom, 0.0005)
),
n as (
  select seg_id, max(length_m) as length_m,
         count(*) filter (where kind = 'crossing') as nc, count(*) filter (where kind = 'traffic_signals') as nt,
         count(*) filter (where kind = 'bus_stop') as nb, count(*) filter (where kind = 'level_crossing') as nl
  from p group by seg_id
)
update segment_features sf set n_crossings = n.nc, n_traffic_signals = n.nt, n_bus_stops = n.nb, n_level_crossings = n.nl,
  crossings_per_km = round((n.nc / greatest(n.length_m, 1) * 1000)::numeric, 2)
from n where n.seg_id = sf.seg_id;
update segment_features set n_crossings = coalesce(n_crossings, 0), n_traffic_signals = coalesce(n_traffic_signals, 0),
  n_bus_stops = coalesce(n_bus_stops, 0), n_level_crossings = coalesce(n_level_crossings, 0),
  crossings_per_km = coalesce(crossings_per_km, 0);

comment on table segment_features is 'Raw OSM-derived values for the 9 ДАБДП elements per segment; *_imputed = value is a class default';
commit;
analyze segment_features;

select road_class, count(*), round(avg(lane_width_m), 2) as lane_w, round(avg((not lane_width_imputed)::int), 2) as width_known,
       round(avg(curvature_deg_per_km)::numeric) as curv, round(avg(access_per_km)::numeric, 1) as access, round(avg(junctions_per_km)::numeric, 1) as junc,
       round(avg(roadside_obstacle_share)::numeric, 2) as roadside, round(avg((not speed_limit_imputed)::int), 2) as speed_known
from segment_features group by 1 order by 1;
