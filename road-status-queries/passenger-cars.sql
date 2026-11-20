-- psql -v road=A1 -f passenger-cars.sql
\if :{?road}
\else
  \set road ''
\endif

select section_id, road, carriageway, km_from, km_to, length_m,
       risk_score, risk_level, access_status, oldest_publication_at, events
from api.road_status_risk(false, null, nullif(:'road', ''))
order by road, carriageway, split_part(section_id, ':', 3)::int, km_from;
