-- 02: crashes (one row per crash) + crash_coverage. Spec: docs/data-aggregation.md §2.2, §3.1, §3.2, §3.6.
-- Needs: crash_rows (01). Re-runnable. seg_id, oblast, in_settlement and wx_* are filled by later steps.
\set ON_ERROR_STOP on
begin;

-- Sun elevation in degrees (NOAA low-precision formula, error < 0.1° — plenty for night/day).
create or replace function sun_elevation(ts timestamptz, lat double precision, lon double precision)
returns double precision language sql immutable parallel safe as $$
  with t as (select extract(epoch from ts) / 86400.0 + 2440587.5 - 2451545.0 as n),
  a as (
    select n,
           radians(mod(357.528 + 0.9856003 * n, 360)) as g,
           mod(280.460 + 0.9856474 * n, 360) as l
    from t
  ),
  b as (
    select n, radians(l + 1.915 * sin(g) + 0.020 * sin(2 * g)) as lam, radians(23.439 - 0.0000004 * n) as eps from a
  ),
  c as (
    select n, asin(sin(eps) * sin(lam)) as dec, atan2(cos(eps) * sin(lam), cos(lam)) as ra from b
  )
  select degrees(asin(sin(radians(lat)) * sin(dec)
         + cos(radians(lat)) * cos(dec) * cos(radians(mod(18.697374558 + 24.06570982441908 * n, 24) * 15 + lon) - ra)))
  from c
$$;

create or replace function decimals_of(t text) returns int language sql immutable as $$
  select case when t is null or t = '' then null
              when position('.' in t) = 0 then 0
              else length(split_part(t, '.', 2)) end
$$;

-- type_raw -> type_group (§3.2)
drop table if exists crash_type_groups cascade;
create table crash_type_groups (type_raw text primary key, type_group text not null);
insert into crash_type_groups values
 ('СБЛЪСКВАНЕ МЕЖДУ МПС ОТЗАД','rear_end'), ('БЛЪСКАНЕ НА СПРЯНО ППС','rear_end'),
 ('СБЛЪСКВАНЕ МЕЖДУ МПС СТРАНИЧНО','side'),
 ('СБЛЪСКВАНЕ МЕЖДУ МПС ПОД ЪГЪЛ','angle'),
 ('СБЛЪСКВАНЕ МЕЖДУ МПС ЧЕЛНО','head_on'),
 ('БЛЪСКАНЕ В КРАЙПЪТНО СЪОРЪЖЕНИЕ','run_off_road'), ('БЛЪСКАНЕ В ПРЕДПАЗНА ОГРАДА','run_off_road'),
 ('БЛЪСКАНЕ В ДЪРВО','run_off_road'), ('БЛЪСКАНЕ В СТЪЛБ','run_off_road'), ('БЛЪСКАНЕ В СКАТ','run_off_road'),
 ('БЛЪСКАНЕ В ПОДПОРНА КОЛОНА','run_off_road'), ('БЛЪСКАНЕ В БИЛБОРД','run_off_road'),
 ('ПРЕОБРЪЩАНЕ НА МПС ИЗВЪН ПЪТНОТО ПЛАТНО','run_off_road'),
 ('ПРЕОБРЪЩАНЕ НА МПС НА ПЪТНОТО ПЛАТНО','rollover'),
 ('БЛЪСКАНЕ НА ПЕШЕХОДЕЦ','pedestrian'), ('БЛЪСКАНЕ НА ДЕТЕ С ЛЕТНИ КЪНКИ, РОЛЕР, ШЕЙНА','pedestrian'),
 ('БЛЪСКАНЕ НА ЛИЦЕ РАБОТЕЩО НА ПЪТЯ','pedestrian'),
 ('БЛЪСКАНЕ НА ВЕЛОСИПЕДИСТ','cyclist'),
 ('БЛЪСКАНЕ НА ПАРКИРАНО ППС','parked'),
 ('БЛЪСКАНЕ НА ЖИВОТНО','animal_cart'), ('БЛЪСКАНЕ НА КАРУЦА','animal_cart'),
 ('БЛЪСКАНЕ В ПРЕПЯТСТВИЕ НА ПЪТЯ','obstacle'),
 ('БЛЪСКАНЕ НА ППС И ВЛАК','train'),
 ('ПАДАНЕ НА ПЪТНИК','other'), ('ДРУГ ВИД ПТП','other'), ('Няма информация','other');

-- Crash key (§2.2): (date, time, type, lat, lon). A person without coordinates joins the located crash
-- with the same (date, time, type) when exactly one such crash exists; otherwise all unlocated persons
-- with the same (date, time, type) form one crash.
drop table if exists crash_person cascade;
create table crash_person as
with r as (
  select *, (lat <> '' and lon <> '') as located from crash_rows
),
lk as (   -- located crashes per (date,time,type)
  select date, time, type, lat, lon, count(*) over (partition by date, time, type) as n_same
  from (select distinct date, time, type, lat, lon from r where located) d
)
select r.row_no,
       r.date, r.time, r.type,
       coalesce(case when r.located then r.lat end, lk.lat) as k_lat,
       coalesce(case when r.located then r.lon end, lk.lon) as k_lon,
       not r.located and lk.lat is not null as coords_borrowed
from r
left join lk on not r.located and lk.date = r.date and lk.time = r.time and lk.type = r.type and lk.n_same = 1;

drop table if exists crashes cascade;
create table crashes as
with g as (
  select p.date, p.time, p.type, p.k_lat, p.k_lon,
         count(*) as n_persons,
         count(*) filter (where cr.died = 'да') as n_killed,
         count(*) filter (where cr.injured = 'да') as n_injured,
         count(*) filter (where p.coords_borrowed) as n_coords_borrowed,
         min(cr.row_no) as first_row
  from crash_person p join crash_rows cr using (row_no)
  group by 1, 2, 3, 4, 5
),
t as (
  select g.*,
         to_timestamp(date || ' ' || time, 'DD/MM/YYYY HH24:MI:SS')::timestamp as ts_local,
         k_lat::double precision as lat0, k_lon::double precision as lon0,
         least(decimals_of(k_lat), decimals_of(k_lon)) as coord_decimals
  from g
)
select
  left(md5(concat_ws('|', date, time, type, k_lat, k_lon)), 12) as crash_id,
  ts_local,
  (ts_local at time zone 'Europe/Sofia') as ts_utc,                       -- timestamptz
  extract(year from ts_local)::int as year,
  extract(month from ts_local)::int as month,
  extract(hour from ts_local)::int as hour,
  extract(isodow from ts_local)::int as dow,                              -- 1 = Monday … 7 = Sunday
  type as type_raw,
  coalesce(tg.type_group, 'other') as type_group,
  n_persons::int, n_killed::int, n_injured::int,
  case when n_killed > 0 then 'fatal' when n_injured > 0 then 'injury' else 'damage' end as severity,
  case when n_killed > 0 then 10 when n_injured > 0 then 3 else 1 end as epdo,
  case when lat0 between 41.2 and 44.3 and lon0 between 22.3 and 28.7 then lon0 end as lon,
  case when lat0 between 41.2 and 44.3 and lon0 between 22.3 and 28.7 then lat0 end as lat,
  coord_decimals,
  case
    when lat0 is null or lon0 is null then 'missing'
    when not (lat0 between 41.2 and 44.3 and lon0 between 22.3 and 28.7) then 'unusable'
    when coord_decimals <= 2 then 'unusable'
    when coord_decimals = 3 then 'approx'
    else 'good'
  end as loc_quality,
  n_coords_borrowed::int,
  first_row as source_row
from t left join crash_type_groups tg on tg.type_raw = t.type;

-- geometry only for usable points
alter table crashes add column geom geometry(Point, 4326);
update crashes set geom = st_setsrid(st_makepoint(lon, lat), 4326) where loc_quality in ('good', 'approx');
alter table crashes add column geom_m geometry(Point, 3035);
update crashes set geom_m = st_transform(geom, 3035) where geom is not null;

-- night: sun below civil twilight (−6°) at the crash point; for unlocated crashes use the centre of Bulgaria
alter table crashes add column sun_elev_deg real;
update crashes set sun_elev_deg = sun_elevation(ts_utc, coalesce(lat, 42.7), coalesce(lon, 25.3));
alter table crashes add column is_night boolean;
update crashes set is_night = sun_elev_deg < -6;

-- filled by later steps
alter table crashes
  add column seg_id text, add column snap_dist_m real,
  add column in_settlement boolean, add column settlement text,
  add column oblast text, add column municipality text,
  add column wx_cell_id text,
  add column wx_fog boolean, add column wx_rain_heavy boolean, add column wx_wind_strong boolean, add column wx_ice boolean;

alter table crashes add primary key (crash_id);
create index crashes_geom_gix on crashes using gist (geom);
create index crashes_geom_m_gix on crashes using gist (geom_m);
create index crashes_ts_idx on crashes (ts_local);
create index crashes_year_sev_idx on crashes (year, severity);

-- §3.6 crash_coverage
drop table if exists crash_coverage cascade;
create table crash_coverage as
select year, severity,
       count(*)::int as n_total,
       count(*) filter (where loc_quality in ('good', 'approx'))::int as n_located,
       round(count(*) filter (where loc_quality in ('good', 'approx'))::numeric / count(*), 4) as coverage
from crashes group by 1, 2;
alter table crash_coverage add primary key (year, severity);

comment on table crashes is 'One row per crash (persons grouped by date, time, type, coordinates). See docs/database.md';
comment on table crash_coverage is 'Share of crashes with usable coordinates per year and severity; reactive score multiplies counts by 1/coverage';
commit;
analyze crashes;

select year, count(*) as crashes, count(*) filter (where severity <> 'damage') as serious,
       count(*) filter (where severity = 'fatal') as fatal, sum(n_killed) as killed, sum(n_injured) as injured
from crashes group by 1 order by 1;
select loc_quality, count(*) from crashes group by 1 order by 2 desc;
select * from crash_coverage order by year, severity;
