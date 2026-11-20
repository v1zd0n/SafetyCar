\set ON_ERROR_STOP on
begin;

create schema if not exists api;
create table if not exists public.road_status_snapshot (
  singleton boolean primary key check (singleton),
  payload jsonb not null
);

create or replace view api.road_status_risk_rules as
select * from (values
  ('PublicEvent',                              15, 15, false),
  ('advice',                                   20, 20, false),
  ('ReversibleLanes',                          25, 30, false),
  ('speedRestrictionInOperation',              30, 35, false),
  ('Maintenance',                              35, 40, false),
  ('SurfaceCondition',                         45, 50, false),
  ('narrowLanes',                              45, 55, false),
  ('trafficControl',                           50, 60, false),
  ('laneClosures',                              55, 65, false),
  ('Weather',                                  55, 65, false),
  ('lanesDeviated',                             60, 70, false),
  ('weightRestrictionInOperation',              60, 70, false),
  ('Visibility',                               65, 75, false),
  ('singleAlternateLineTraffic',               65, 75, false),
  ('followLocalDiversion',                     65, 75, false),
  ('contraflow',                               70, 80, false),
  ('carriagewayClosures',                      75, 85, false),
  ('Obstruction',                              80, 85, false),
  ('severeWeather',                            85, 90, false),
  ('Accident',                                 90, 90, false),
  ('accessRestriction',                       100, 100, true),
  ('roadClosed',                               100, 100, true)
) as rules(event_kind, car_score, heavy_score, blocks_access);

create or replace function api.road_status_risk(
  is_heavy boolean, weight_t numeric, road_filter text
)
returns table (
  section_id text, road text, carriageway text, km_from numeric, km_to numeric,
  length_m numeric, risk_score integer, risk_level text, access_status text,
  oldest_publication_at timestamptz, events jsonb, geom geometry
)
language sql stable as $$
  with snapshot as (
    select payload, (select min(value::timestamptz)
      from jsonb_each_text(payload -> 'publications')) as published_at
    from public.road_status_snapshot
  ), source as (
    select published_at, published_at between now() - interval '45 minutes'
      and now() + interval '5 minutes' as fresh
    from (select (select published_at from snapshot) as published_at) s
  ), pieces as not materialized (
    select s.*, (s.piece_no - 1) / 3 as section_no
    from public.segments s where road_filter is null or s.road = road_filter
  ), active as (
    select e.*, st_simplify(st_transform(st_setsrid(st_geomfromgeojson(e.geometry), 4326), 3035), 3, true) as geom_m,
      case
        when e.feed = 'AccessRestrictions' then 'accessRestriction'
        when e.feed = 'ReversibleLanes' then e.feed
        when e.type = 'sitReroutingManagement' then 'followLocalDiversion'
        when e.subtype in ('temporaryTrafficLights', 'trafficBeingManuallyDirected') then 'trafficControl'
        when e.feed = 'ClosedRoads' then coalesce(r.event_kind, 'advice')
        when e.conditions ?| array['ice', 'blackIce', 'freezingRain', 'snowDrifts',
          'highWinds', 'strongWinds', 'veryStrongGusts', 'heavySnowfall'] then 'severeWeather'
        else e.feed
      end as event_kind
    from snapshot
    cross join lateral jsonb_to_recordset(payload -> 'events') as e(
      id text, feed text, type text, subtype text, conditions jsonb, starts_at timestamptz,
      ends_at timestamptz, vehicle_rules jsonb, description text, road text,
      directional boolean, geometry jsonb
    )
    left join api.road_status_risk_rules r on r.event_kind = e.subtype
    where (e.starts_at is null or e.starts_at <= now())
      and (e.ends_at is null or e.ends_at > now())
      and (road_filter is null or e.road is null or e.road = road_filter)
  ), applicable as (
    select a.*, r.blocks_access,
      case when is_heavy then r.heavy_score else r.car_score end as score,
      scope.confirmed
    from active a
    join api.road_status_risk_rules r using (event_kind)
    cross join lateral (
      select bool_or(not v.conditional and target.weights <@ w.weights) as confirmed
      from jsonb_to_recordset(a.vehicle_rules) as v(weights jsonb, conditional boolean)
      cross join lateral (
        select coalesce(range_intersect_agg(case rule.operator
          when 'greaterThan' then numrange(rule.tonnes, null, '()')
          when 'greaterThanOrEqualTo' then numrange(rule.tonnes, null, '[)')
          when 'lessThan' then numrange(null, rule.tonnes, '()')
          when 'lessThanOrEqualTo' then numrange(null, rule.tonnes, '(]')
          when 'equalTo' then numrange(rule.tonnes, rule.tonnes, '[]')
        end), numrange(null, null)) as weights
        from jsonb_to_recordset(v.weights) as rule(tonnes numeric, operator text)
      ) w
      cross join lateral (select case
        when weight_t is not null then numrange(weight_t, weight_t, '[]')
        when is_heavy then numrange(3.5, null, '()')
        else numrange(0, 3.5, '(]')
      end as weights) target
      where target.weights && w.weights
    ) scope
    where scope.confirmed is not null
  ), matches as (
    select a.*, nearest.road as matched_road, nearest.carriageway, nearest.part_no, nearest.section_no,
      not a.directional or nearest.carriageway = 'dual' as direction_confirmed
    from applicable a
    cross join lateral (
      -- Search the full network before applying the road filter, including for unnamed points.
      select p.road, p.carriageway, p.part_no, (p.piece_no - 1) / 3 as section_no
      from public.segments p
      where a.road is null and st_dwithin(p.geom_m, a.geom_m, 60)
      order by p.geom_m <-> a.geom_m, p.seg_id
      limit 1
    ) nearest
    where road_filter is null or nearest.road = road_filter
    union all
    select a.*, p.road, p.carriageway, p.part_no, p.section_no,
      not a.directional or p.carriageway = 'dual' as direction_confirmed
    from applicable a
    join pieces p on p.road = a.road and st_dwithin(p.geom_m, a.geom_m, 30)
    cross join lateral (select st_buffer(a.geom_m, 30, 'endcap=flat') as corridor) c
    where st_length(st_intersection(p.geom_m, c.corridor)) >=
      greatest(0.1, least(15, p.length_m, st_length(a.geom_m) / 4))
      and (not a.directional or p.carriageway <> 'dual' or
        st_linelocatepoint(a.geom_m, st_startpoint(p.geom_m)) <
        st_linelocatepoint(a.geom_m, st_endpoint(p.geom_m)))
  ), reasons as (
    select distinct matched_road, carriageway, part_no, section_no, id, event_kind,
      case when blocks_access and not (confirmed and direction_confirmed) then 90 else score end as score,
      case when blocks_access and confirmed and direction_confirmed then 2
           when blocks_access or event_kind = 'weightRestrictionInOperation' then 1
           else 0 end as access_rank,
      vehicle_rules, description
    from matches
  ), scores as (
    select matched_road, carriageway, part_no, section_no, max(score) as score, max(access_rank) as access_rank,
      jsonb_agg(jsonb_build_object('id', id, 'kind', event_kind, 'score', score,
        'vehicle_rules', vehicle_rules, 'description', description) order by score desc, id, event_kind) as events
    from reasons
    group by matched_road, carriageway, part_no, section_no
  ), sections as (
    select p.road, p.carriageway, p.part_no, p.section_no, min(p.km_from) as km_from,
      max(p.km_to) as km_to, sum(p.length_m) as length_m,
      st_makeline(p.geom order by p.piece_no) as geom
    from pieces p
    group by p.road, p.carriageway, p.part_no, p.section_no
  )
  select concat_ws(':', s.road, s.carriageway, s.part_no, s.section_no + 1),
    s.road, s.carriageway, s.km_from, s.km_to, s.length_m,
    case when source.fresh then coalesce(r.score, 0) end,
    case when not coalesce(source.fresh, false) then 'unknown'
         when r.score is null then 'no_reported_events'
         when r.score < 35 then 'low'
         when r.score < 60 then 'moderate'
         when r.score < 80 then 'high'
         when r.score < 100 then 'very_high'
         else 'blocked' end,
    case when not coalesce(source.fresh, false) then 'unknown'
         when r.access_rank = 2 then 'blocked'
         when r.access_rank = 1 then 'conditional'
         else 'no_reported_ban' end,
    source.published_at, coalesce(r.events, '[]'::jsonb), s.geom
  from sections s
  cross join source
  left join scores r on (r.matched_road, r.carriageway, r.part_no, r.section_no) =
                         (s.road, s.carriageway, s.part_no, s.section_no);
$$;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'safetycar_ro') then
    grant usage on schema api to safetycar_ro;
    grant select on public.road_status_snapshot, api.road_status_risk_rules to safetycar_ro;
    grant execute on function api.road_status_risk(boolean, numeric, text) to safetycar_ro;
  end if;
end;
$$;

commit;
