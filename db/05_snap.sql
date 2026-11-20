-- 05: attach crashes to segments and areas. Spec: docs/data-aggregation.md §3.4.
-- Nearest segment within 30 m (loc_quality good) or 100 m (approx); otherwise seg_id stays NULL.
-- in_settlement / settlement / oblast / municipality come from the crash point itself (wx_cell_id: 07a).
\set ON_ERROR_STOP on
begin;

update crashes c set seg_id = null, snap_dist_m = null, in_settlement = null, settlement = null,
                     oblast = null, municipality = null;

update crashes c set seg_id = n.seg_id, snap_dist_m = round(n.d::numeric, 1)
from (
  select c2.crash_id, s.seg_id, s.d
  from crashes c2
  cross join lateral (
    select sg.seg_id, st_distance(sg.geom_m, c2.geom_m) as d
    from segments sg
    where st_dwithin(sg.geom_m, c2.geom_m, case c2.loc_quality when 'good' then 30 else 100 end)
    order by sg.geom_m <-> c2.geom_m
    limit 1
  ) s
  where c2.geom_m is not null
) n
where n.crash_id = c.crash_id;

update crashes c set in_settlement = exists (select 1 from settlements s where st_intersects(s.geom_m, c.geom_m))
where c.geom_m is not null;
update crashes c set settlement = (select s.name from settlements s where st_intersects(s.geom_m, c.geom_m) limit 1)
where c.in_settlement;
update crashes c set
  oblast = (select o.name from oblasts o where st_intersects(o.geom_m, c.geom_m) limit 1),
  municipality = (select m.name from municipalities m where st_intersects(m.geom_m, c.geom_m) limit 1)
where c.geom_m is not null;

create index if not exists crashes_seg_idx on crashes (seg_id);
commit;
analyze crashes;

-- Check against NSI 2024: 2,302 serious crashes outside settlements on A + I + II + III (265 / 706 / 614 / 717)
select s.road_class, count(*) filter (where c.severity <> 'damage') as serious_2024_outside,
       round(sum(1.0 / cv.coverage) filter (where c.severity <> 'damage')) as coverage_corrected
from crashes c join segments s using (seg_id)
join crash_coverage cv on cv.year = c.year and cv.severity = c.severity
where c.year = 2024 and not c.in_settlement
group by 1 order by 1;
select count(*) filter (where seg_id is not null) as snapped, count(*) filter (where geom is not null) as located,
       count(*) filter (where seg_id is not null and not in_settlement) as snapped_outside from crashes;
