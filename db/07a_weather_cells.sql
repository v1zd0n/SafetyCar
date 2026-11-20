-- 07a: weather cells (PoC: 1° x 1°). Sets wx_cell_id on segments and crashes and lists the cells to download.
\set ON_ERROR_STOP on
begin;
create or replace function wx_cell(lat double precision, lon double precision) returns text
language sql immutable parallel safe as $$
  select to_char(floor(lat) + 0.5, 'FM90.0') || '_' || to_char(floor(lon) + 0.5, 'FM90.0')
$$;

update segments set wx_cell_id = wx_cell(st_y(st_lineinterpolatepoint(geom, 0.5)), st_x(st_lineinterpolatepoint(geom, 0.5)));
update crashes set wx_cell_id = case when geom is not null then wx_cell(lat, lon) end;

drop view if exists weather_cells_needed;
create view weather_cells_needed as
select wx_cell_id, split_part(wx_cell_id, '_', 1)::real as lat, split_part(wx_cell_id, '_', 2)::real as lon
from crashes where seg_id is not null group by 1 order by 1;
commit;
select count(*) as cells from weather_cells_needed;
