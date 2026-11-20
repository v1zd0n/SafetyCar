-- 03: settlements (built-up areas), oblasts and municipalities from OSM. Needs the osm schema (db/osm/safetycar.lua).
-- Settlement = residential/commercial/retail landuse + place polygons, merged with a morphological closing
-- (buffer +60 m, −40 m) so streets between blocks count as inside. Villages and towns with no polygon get a 300 m circle.
-- Industrial zones are NOT settlements (many sit along motorways outside towns).
\set ON_ERROR_STOP on
begin;

drop table if exists oblasts cascade;
create table oblasts as
select row_number() over (order by name)::int as oblast_id, name, name_en, geom::geometry(MultiPolygon, 4326) as geom,
       st_transform(geom, 3035)::geometry(MultiPolygon, 3035) as geom_m
from osm.admin
where admin_level = 4
  and st_within(st_pointonsurface(geom), (select geom from osm.admin where admin_level = 2 and name = 'България' limit 1));
create index oblasts_gix on oblasts using gist (geom_m);

drop table if exists municipalities cascade;
create table municipalities as
select row_number() over (order by name)::int as municipality_id, name, name_en,
       geom::geometry(MultiPolygon, 4326) as geom, st_transform(geom, 3035)::geometry(MultiPolygon, 3035) as geom_m
from osm.admin
where admin_level = 5
  and st_within(st_pointonsurface(geom), (select geom from osm.admin where admin_level = 2 and name = 'България' limit 1));
create index municipalities_gix on municipalities using gist (geom_m);

drop table if exists settlements cascade;
create table settlements as
with src as (
  select st_transform(geom, 3035) as g from osm.areas
  where (kind = 'builtup' and subkind in ('residential', 'commercial', 'retail')) or kind = 'place'
  union all
  select st_buffer(st_transform(p.geom, 3035), 300) from osm.places p
  where p.place in ('city', 'town', 'village')
    and not exists (select 1 from osm.areas a where a.kind in ('builtup', 'place') and st_dwithin(a.geom, p.geom, 0.003))
),
clustered as (   -- union per cluster keeps the union cheap
  select st_clusterdbscan(g, 60, 1) over () as cid, g from src
),
blobs as (
  select (st_dump(st_buffer(st_buffer(st_union(st_buffer(g, 60)), -40), 0))).geom as g
  from clustered group by cid
)
select row_number() over ()::int as settlement_id, g::geometry(Polygon, 3035) as geom_m
from blobs where st_area(g) > 5000;
create index settlements_gix on settlements using gist (geom_m);

alter table settlements add column geom geometry(MultiPolygon, 4326);
update settlements set geom = st_multi(st_transform(geom_m, 4326));
create index settlements_geom_gix on settlements using gist (geom);

-- name and place type from the biggest place node inside
alter table settlements add column name text, add column place text;
update settlements s set (name, place) = (
  select pl.name, pl.place from osm.places pl
  where st_intersects(s.geom, pl.geom)
  order by case pl.place when 'city' then 1 when 'town' then 2 when 'village' then 3 else 4 end, pl.name
  limit 1
);
commit;
analyze oblasts; analyze municipalities; analyze settlements;
select (select count(*) from oblasts) as oblasts, (select count(*) from municipalities) as municipalities,
       (select count(*) from settlements) as settlements, (select count(*) from settlements where name is not null) as named,
       (select round(sum(st_area(geom_m))/1e6) from settlements) as settlement_km2;
