"""Diagnostic (not pass/fail): how long the live "risk now" query and its parts take.

    .venv/bin/python tests/perf_live.py

Read-only. The whole network should stay well under a second locally; the API caches it for 2 minutes.
If it gets slow, look at the parts: they are each a few ms when the plan is right.
"""
import time

from common import connect


def timed(conn, label, sql):
    t = time.time()
    n = conn.execute(sql).fetchone()[0]
    print(f"{label:45s} {time.time() - t:6.2f} s  ({n} rows)")


with connect() as c:
    timed(c, "api.live_sections, whole network, cars", "select count(*) from api.live_sections(false, null)")
    timed(c, "api.live_sections, whole network, heavy", "select count(*) from api.live_sections(true, null)")
    timed(c, "api.live_sections, A1 only", "select count(*) from api.live_sections(false, 'A1')")
    timed(c, "  live.sections (sections + baseline)", "select count(base_score) from live.sections")
    timed(c, "  live.cell_conditions", "select count(*) from live.cell_conditions")
    timed(c, "  live.station_now", "select count(*) from live.station_now")
    timed(c, "  live.warnings_now", "select count(*) from live.warnings_now")
    timed(c, "  night check for every section", "select count(*) filter (where sun_elevation(now(), mid_lat, mid_lon) < -6) from live.section_geo")
    timed(c, "api.road_status_risk, A1 (vlado, uncached)", "select count(*) from api.road_status_risk(false, null, 'A1')")
