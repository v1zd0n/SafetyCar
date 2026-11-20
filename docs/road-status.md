# Live road events and section risk

The queries use public DATEX II publications from the Bulgarian Road Infrastructure Agency (RIA, Bulgarian
АПИ). The fetch script requests the latest JSON file for each category using
`GET /api/<category>/json/files`, then downloads it using `GET /api/Files/<id>`. The service base URL is
`https://traffic.api.bg/EsriBg.RIA.DatexII.WebApi`. [RIA National Access Point](https://traffic.api.bg/road-status/nap)

See also [the PostGIS database](database.md) and [the other real-time data sources](realtime-data.md).

---

## 1. Run the queries

You need Node.js 18+ and the SafetyCar PostgreSQL database with PostGIS and `public.segments`.
Run these commands in Bash from the repository root with access to the database.

```bash
set -o pipefail
psql -h localhost -d safetycar -f road-status-queries/install.sql
node road-status-queries/fetch.mjs | psql -h localhost -d safetycar -v ON_ERROR_STOP=1

# Passenger cars
psql -h localhost -d safetycar -v road=A1 -f road-status-queries/passenger-cars.sql

# All vehicles over 3.5 tonnes
psql -h localhost -d safetycar -v road=A1 -f road-status-queries/heavy-vehicles.sql

# A vehicle with a maximum permissible mass of 18 tonnes
psql -h localhost -d safetycar -v road=A1 -v weight_t=18 -f road-status-queries/heavy-vehicles.sql
```

Omit `-v road=...` to return all sections. Use a road identifier from the database, such as `A1`,
`I-5`, or `II-81`. The application can call `api.road_status_risk(false, null, 'A1')` or
`api.road_status_risk(true, 18, 'A1')` directly. The function also returns the section geometry in WGS 84.

To reprocess saved publications, run `node road-status-queries/fetch.mjs --from-dir ./publications`
and pipe the output to `psql` as above. The directory must contain all ten files, named by category,
for example `ClosedRoads.json`. If a download fails or a publication is invalid, the database keeps
the last successfully loaded snapshot. When the oldest publication is more than 45 minutes old,
the query returns `unknown` with a null score. Run the refresh command periodically to keep scores current.

---

## 2. Risk scoring

These are SafetyCar’s initial weights for current events, ordered from lowest to highest risk. The
rules are in the `api.road_status_risk_rules` view in [install.sql](../road-status-queries/install.sql).

| Event | Passenger cars | Vehicles over 3.5 t |
|---|---:|---:|
| Public event, advisory to drive carefully, reversible lane | 15–25 | 15–30 |
| Speed restriction, roadworks | 30–35 | 35–40 |
| Damaged road surface, narrow lanes, traffic controlled by signals or personnel | 45–50 | 50–60 |
| Lane closure or lane shift, adverse weather | 55–60 | 65–70 |
| Reported mass restriction with an unconfirmed threshold | 60 | 70 |
| Reduced visibility, alternating traffic in one lane, detour | 65 | 75 |
| Two-way traffic on one carriageway or carriageway closure | 70–75 | 80–85 |
| Obstruction or landslide | 80 | 85 |
| Severe conditions such as ice or strong winds | 85 | 90 |
| Crash | 90 | 90 |
| Access restriction that may apply depending on additional conditions | 90 | 90 |
| Full closure or access restriction that applies to the vehicle | 100 | 100 |

Each section takes the highest score among applicable active events. With fresh data and no matched
events, the result is `0 / no_reported_events`. The `events` field contains the event ID, rule, score,
and description when available.

For a restriction based only on mass and applying to vehicles over 12 tonnes, the heavy-vehicle query
returns `conditional` when no mass is specified, omits the restriction at exactly 12 tonnes, and returns
`blocked` at 18 tonnes. The restriction is excluded from the passenger-car assessment. Restrictions
depending on trailers, vehicle dimensions, through traffic, or an unresolved direction on a two-way
section remain `conditional` until the necessary details are available.

---

## 3. Match events to the road network

Up to three consecutive SafetyCar segments form a section of about 3 km. Sections at the end of a road
fragment can be shorter. Line events are matched by road number and overlap within a 30 m corridor.
When RIA specifies a direction, matching uses the orientation of the one-way carriageway geometry in
OpenStreetMap (OSM). Point events are matched to the nearest segment within 60 m. The kilometre values
in the results measure distance along the OSM road fragment.

Matching is approximate near junctions and parallel carriageways. Events with unsupported geometry or
without a matching section are excluded from the results. Reversible lanes appear as advisories during
the published programme period. Holiday and time-of-day schedules are excluded from the calculation of
current lane status.
