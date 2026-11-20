"""Goal.md criteria 3 and 4 as scenarios on the live layer.

    .venv/bin/python tests/check_live_scenarios.py

Inserts made-up АПИ events, weather readings and warnings, checks the results, and ROLLS BACK everything at the end
(one transaction; nothing is kept). Needs a role that may write schema live and public.road_status_snapshot
(the owner / DATABASE_URL_WRITE), and the live layer installed (backend: npm run setup-db).

Criterion 3: a mass-only restriction "over 12 t" is excluded for cars and for exactly 12 t, applies at 18 t and is
conditional when the mass is unspecified; a full closure is shown; expired and future events are ignored; a stale
АПИ feed gives "unknown". Criterion 4: a multiplier with enough evidence is applied, one without stays neutral,
stale and missing weather are visible, a MeteoAlarm warning switches its condition on.
"""
import json

from common import Report, connect

r = Report()
c = connect(read_only=False)
q = lambda sql, p=None: c.execute(sql, p).fetchall()  # noqa: E731
FEEDS = ["PublicEvent", "ReversibleLanes", "Maintenance", "SurfaceCondition", "Weather", "Visibility", "Obstruction",
         "Accident", "ClosedRoads", "AccessRestrictions"]

try:
    # isolate from the real live data (all of this is rolled back)
    c.execute("delete from live.warnings")
    c.execute("delete from live.station")
    c.execute("delete from live.weather")

    # one A1 section; the events lie on its middle segment
    sid, cell = q("""select section_id, wx_cell_id from live.sections
                     where road = 'A1' and carriageway = 'dual' and base_score is not null order by section_id limit 1 offset 40""")[0]
    seg_geom = json.loads(q("""select st_asgeojson(geom) from segments
                               where concat_ws(':', road, carriageway, part_no, (piece_no - 1) / 3 + 1) = %s
                               order by piece_no limit 1 offset 1""", (sid,))[0][0])
    now = q("select now()")[0][0]

    def event(id_, feed, typ, subtype=None, rules=None, starts=None, ends=None):
        return {"id": id_, "feed": feed, "type": typ, "subtype": subtype, "conditions": [], "starts_at": starts,
                "ends_at": ends, "vehicle_rules": rules or [{"weights": [], "conditional": False}], "description": id_,
                "road": "A1", "directional": False, "geometry": seg_geom}

    def snapshot(events, age_min=1):
        published = q("select (now() - make_interval(mins => %s))::text", (age_min,))[0][0]
        c.execute("delete from public.road_status_snapshot")
        c.execute("insert into public.road_status_snapshot values (true, %s::jsonb)",
                  (json.dumps({"publications": {f: published for f in FEEDS}, "events": events}),))

    def road_status(heavy, weight):
        return q("""select risk_score, risk_level, access_status, events from api.road_status_risk(%s, %s, 'A1')
                    where section_id = %s""", (heavy, weight, sid))[0]

    def live(cols):
        return q(f"select {cols} from api.live_sections(false, 'A1') where section_id = %s", (sid,))[0]

    # --- criterion 3: vehicle classes and event timing (vlado's api.road_status_risk) -------------------------------------
    snapshot([event("R12", "AccessRestrictions", "accessRestriction",
                    rules=[{"weights": [{"tonnes": 12, "operator": "greaterThan"}], "conditional": False}])])
    car, t12, t18, heavy = road_status(False, None), road_status(True, 12), road_status(True, 18), road_status(True, None)
    r.check("restriction over 12 t: excluded for passenger cars", car[2] == "no_reported_ban" and car[0] == 0, car[:3])
    r.check("restriction over 12 t: excluded at exactly 12 t", t12[2] == "no_reported_ban", t12[:3])
    r.check("restriction over 12 t: applies (blocked) at 18 t", t18[1] == "blocked" and t18[2] == "blocked", t18[:3])
    r.check("restriction over 12 t: conditional when the mass is unspecified", heavy[2] == "conditional", heavy[:3])

    snapshot([event("CLOSED", "ClosedRoads", "sitRoadOrCarriagewayOrLaneManagement", "roadClosed")])
    res = road_status(False, None)
    r.check("full closure shown as blocked", res[1] == "blocked" and res[2] == "blocked", res[:3])
    snapshot([event("OLD", "Maintenance", "sitMaintenanceWorks",
                    starts=str(now.replace(year=now.year - 1)), ends=str(now.replace(year=now.year - 1, day=1)))])
    res = road_status(False, None)
    r.check("expired event excluded", res[0] == 0 and res[3] == [], res[:3])
    snapshot([event("FUTURE", "Maintenance", "sitMaintenanceWorks", starts=str(now.replace(year=now.year + 1)))])
    res = road_status(False, None)
    r.check("future event excluded", res[0] == 0 and res[3] == [], res[:3])
    snapshot([event("CLOSED", "ClosedRoads", "sitRoadOrCarriagewayOrLaneManagement", "roadClosed")], age_min=60)
    res = road_status(False, None)
    r.check("stale АПИ feed (60 min old) -> unknown", res[1] == "unknown" and res[0] is None, res[:3])

    # --- the same through our layer (api.live_sections reads the cached live.road_status_sections) -----------------------
    snapshot([event("CLOSED", "ClosedRoads", "sitRoadOrCarriagewayOrLaneManagement", "roadClosed")])
    c.execute("delete from live.road_status_sections")
    c.execute("""insert into live.road_status_sections
                 select 'car', section_id, road, carriageway, km_from, km_to, risk_score, risk_level, access_status,
                        oldest_publication_at, events, now() from api.road_status_risk(false, null, 'A1')""")
    res = live("live_level, access_status, live_score")
    r.check("live map: closure -> live_level blocked", res[0] == "blocked", res)
    c.execute("update live.road_status_sections set oldest_publication_at = now() - interval '2 hours'")
    res = live("live_level, road_status_level, risk_now")
    r.check("live map: stale АПИ -> road status unknown, historical risk still shown", res[1] == "unknown" and res[2] is not None, res)

    # --- criterion 4: weather --------------------------------------------------------------------------------------------
    mult = dict(q("select condition, multiplier from api.weather_multipliers"))

    def weather(t, td, low, cloud, gust, age_min=5):
        c.execute("delete from live.weather")
        c.execute("""insert into live.weather (wx_cell_id, fetched_at, ts_utc, temperature_2m, dew_point_2m, precip_1h,
                     precip_6h, cloud_cover, cloud_cover_low, wind_gusts_10m, visibility)
                     values (%s, now() - make_interval(mins => %s), now(), %s, %s, 0, 0, %s, %s, %s, 150)""",
                  (cell, age_min, t, td, cloud, low, gust))

    weather(8, 7.6, 98, 100, 5)                                   # fog by the historical rule
    res = live("conditions, multiplier, base_score, risk_now, weather_status")
    r.check("fog (enough evidence) -> its multiplier is applied to the historical risk",
            "fog" in res[0] and abs(res[1] - mult["fog"]) < 0.01 and abs(res[3] - min(100, res[2] * mult["fog"])) < 0.2, res)
    weather(-1, -6, 0, 10, 5)                                     # ice by the model rule (clear and freezing)
    res = live("conditions, multiplier")
    r.check("ice (not enough evidence) -> multiplier stays 1", "ice" in res[0] and mult["ice"] == 1.0 and res[1] == 1.0, (res, mult["ice"]))
    weather(8, 7.6, 98, 100, 5, age_min=180)                      # the same fog, but 3 h old
    res = live("conditions, weather_status, weather")
    r.check("stale weather is not used for conditions", "fog" not in res[0], res[0])
    r.check("stale weather is visible to the user", res[1] == "stale" and res[2].get("status") == "stale" and "observed_at" in res[2], res[1:])
    c.execute("delete from live.weather")
    res = live("weather_status, weather")
    r.check("missing weather is visible to the user", res[0] == "missing" and res[1].get("status") == "missing", res)

    weather(15, 5, 0, 50, 5)                                      # calm weather, but an official fog warning
    oblast = q("select oblast from live.sections where section_id = %s", (sid,))[0][0]
    nuts3 = q("select nuts3 from live.nuts3_oblast where oblast = %s", (oblast,))[0][0]
    c.execute("""insert into live.warnings values ('TEST:' || %s, now(), %s, 'test', 'Fog', 'fog', 'orange', 'Severe',
                 now() - interval '1 hour', now() + interval '1 hour', 'Orange Fog Warning')""", (nuts3, nuts3))
    res = live("conditions, jsonb_array_length(warnings)")
    r.check("MeteoAlarm fog warning -> fog condition on and the warning listed", "fog" in res[0] and res[1] >= 1, res)
finally:
    c.rollback()
    c.close()

r.finish("live scenarios (rolled back)")
