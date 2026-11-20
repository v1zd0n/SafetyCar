-- ПТП 2021–2025 (ptp_history_21to25.csv) -> PostGIS.
-- Пускане: psql -d safetycar -f db/01_ptp.sql < ptp_history_21to25.csv   (CSV-то идва на stdin)
-- Безопасно за повторно пускане: таблиците се пресъздават.
--
-- ВНИМАНИЕ: един ред в CSV е един УЧАСТНИК, не едно ПТП (виж docs/data-aggregation.md §2.1).
-- Таблицата ptp е на ниво участник; броене на ПТП става по ключа (date, time, x, y, type).
-- Следваща стъпка: таблица crashes + crash_coverage по схемата в docs/data-aggregation.md §3.1.
--
-- Координатите в CSV са десетични градуси без десетичната точка и с различна точност:
--   y=4255073 -> 42.55073, x=2640487106 -> 26.40487106, y=4.31426E+11 (повредено от Excel) -> 43.1426.
-- Правило: от числото остават цифрите на мантисата, първите две са целата част.
-- Валидни са само точки в рамката на България (ширина 41.2–44.3, дължина 22.3–28.7);
-- при разменени x/y се разменят обратно. Останалите получават geom = NULL и coord_status.

\set ON_ERROR_STOP on
begin;

drop table if exists ptp cascade;
drop table if exists ptp_raw cascade;

-- 1. Суров вход, текст както е във файла.
create table ptp_raw (
  year text, date text, time text, y text, x text, type text, injured text, died text
);
\copy ptp_raw from pstdin with (format csv, header true, encoding 'UTF8')
alter table ptp_raw add column raw_id bigint generated always as identity;

-- 2. Разчитане на една координата.
create or replace function ptp_coord(s text) returns double precision
language sql immutable as $$
  select case
    when s is null or btrim(s) = '' then null
    else (
      with d as (
        -- мантисата: всичко преди E, без точката
        select regexp_replace(split_part(upper(btrim(s)), 'E', 1), '[^0-9]', '', 'g') as m
      )
      select case when length(m) >= 3 then (substr(m, 1, 2) || '.' || substr(m, 3))::double precision end from d
    )
  end
$$;

-- 3. Почистена таблица.
create table ptp as
with c as (
  select raw_id, year::int as year,
         to_timestamp(date || ' ' || time, 'DD/MM/YYYY HH24:MI:SS')::timestamp as occurred_at,
         btrim(type) as type,
         injured = 'да' as injured,
         died = 'да' as died,
         ptp_coord(y) as lat0, ptp_coord(x) as lon0,
         y as y_raw, x as x_raw
  from ptp_raw
), s as (
  select *,
    case
      when lat0 between 41.2 and 44.3 and lon0 between 22.3 and 28.7 then 'ok'
      when lon0 between 41.2 and 44.3 and lat0 between 22.3 and 28.7 then 'swapped'
      when lat0 is null and lon0 is null then 'missing'
      when lat0 is null or lon0 is null then 'partial'
      else 'out_of_bg'
    end as coord_status
  from c
)
select raw_id as id, year, occurred_at, type, injured, died,
       injured or died as severe,           -- методиката брои само ПТП с ранени или загинали
       coord_status,
       case coord_status
         when 'ok'      then st_setsrid(st_makepoint(lon0, lat0), 4326)
         when 'swapped' then st_setsrid(st_makepoint(lat0, lon0), 4326)
       end::geometry(Point, 4326) as geom,
       y_raw, x_raw
from s;

alter table ptp add primary key (id);
create index ptp_geom_gix on ptp using gist (geom);
create index ptp_time_idx on ptp (occurred_at);
create index ptp_severe_idx on ptp (severe) where severe;

comment on table ptp is 'ПТП 2021–2025 от ptp_history_21to25.csv; geom е NULL при coord_status <> ok/swapped';
commit;

analyze ptp;

select coord_status, count(*), count(*) filter (where severe) as severe from ptp group by 1 order by 2 desc;
select year, count(*), count(*) filter (where severe) as severe, count(geom) as with_geom from ptp group by 1 order by 1;
