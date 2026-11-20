"""Run the whole analysis against the database in DATABASE_URL (or .env) and refresh the api views.

    .venv/bin/python analysis/run.py

Order: reactive -> proactive -> weather_rr -> weights -> explain -> validate -> sql/api_risk.sql
(+ backend/sql/live.sql when the live layer is installed). ~20 s.
"""
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import explain        # noqa: E402
import proactive      # noqa: E402
import reactive       # noqa: E402
import validate       # noqa: E402
import weather_rr     # noqa: E402
import weights        # noqa: E402
from db import connect  # noqa: E402

STEPS = [("reactive", reactive.run), ("proactive", proactive.run), ("weather_rr", weather_rr.run),
         ("weights", weights.run), ("explain", explain.run), ("validate", validate.run)]


def main():
    with connect() as conn:
        for name, fn in STEPS:
            t = time.time()
            fn(conn)
            conn.commit()
            print(f"{name:10s} {time.time() - t:5.1f} s")
        # rebuilding the analysis tables drops the views on top of them: re-create them (live.sql only if installed)
        conn.execute((Path(__file__).parent / "sql" / "api_risk.sql").read_text())
        live = Path(__file__).parent.parent / "backend" / "sql" / "live.sql"
        installed = conn.execute("select to_regclass('public.road_status_snapshot') is not null").fetchone()[0]
        if live.exists() and installed:
            conn.execute(live.read_text())
        conn.commit()
        print("api views refreshed" + (" (+ live)" if installed else " (live layer not installed)"))
        for metric, value in conn.execute(
                "select metric, value from analysis.validation where metric in "
                "('top10_score_fatal', 'top10_priority_fatal', 'top10_baseline_fatal', 'chance') order by metric"):
            print(f"  {metric:24s} {value:.3f}")


if __name__ == "__main__":
    main()
