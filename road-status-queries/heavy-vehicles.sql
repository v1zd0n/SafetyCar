-- psql -v road=A1 -v weight_t=18 -f heavy-vehicles.sql
\set ON_ERROR_STOP on
\if :{?road}
\else
  \set road ''
\endif
\if :{?weight_t}
\else
  \set weight_t ''
\endif

-- Validate the optional parameter before returning rows.
select case when :'weight_t' = '' then true
            when :'weight_t'::numeric > 3.5 and :'weight_t'::numeric < 'Infinity'::numeric then true
            else ('weight_t must be greater than 3.5: ' || :'weight_t')::boolean end as valid_weight
\gset

select section_id, road, carriageway, km_from, km_to, length_m,
       risk_score, risk_level, access_status, oldest_publication_at, events
from api.road_status_risk(true, nullif(:'weight_t', '')::numeric, nullif(:'road', ''))
order by road, carriageway, split_part(section_id, ':', 3)::int, km_from;
