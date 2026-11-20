-- 01: raw crash rows (one row = one PERSON involved), from scripts/prepare_crash_rows.py.
-- Run: python scripts/prepare_crash_rows.py ptp_history_21to25.csv PTP_Layer.dbf | psql -d safetycar -f db/01_crash_rows.sql
-- Re-runnable. Replaces the earlier ptp/ptp_raw tables.
\set ON_ERROR_STOP on
begin;
drop table if exists ptp cascade;
drop table if exists ptp_raw cascade;
drop function if exists ptp_coord(text);
drop table if exists crash_rows cascade;

create table crash_rows (
  row_no   int primary key,         -- line number in the CSV (1 = first data row)
  year     int not null,
  date     text not null,           -- dd/mm/yyyy, as in the CSV
  time     text not null,           -- hh:mm:ss
  y_raw    text,                    -- latitude as in the CSV (point removed, sometimes Excel-mangled)
  x_raw    text,                    -- longitude as in the CSV
  type     text not null,
  injured  text not null,           -- да/не
  died     text not null,           -- да/не
  lat      text,                    -- full-precision latitude from PTP_Layer.shp (decimal text, '' = none)
  lon      text
);
\copy crash_rows from pstdin with (format csv, header true, encoding 'UTF8')
commit;
analyze crash_rows;
select count(*) as rows, count(*) filter (where lat <> '' and lon <> '') as with_coords from crash_rows;
