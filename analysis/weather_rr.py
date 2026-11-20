"""Weather layer: relative risk (RR) of crashing in fog / heavy rain / strong wind / ice, and at night.

RR = (crashes in flagged hours / flagged hours) / (crashes in all hours / all hours)   (RoadEvalGuidelines.docx)

- Country-wide RR, stratified by weather cell: expected = sum over cells of crashes_c x flagged_hours_c / hours_c.
  These become the "risk now" multipliers. A multiplier is used only if the lower 95% bound is > 1 and there are
  at least MIN_OBS crashes; otherwise it is 1 (we never lower the risk because of weather).
- Night: the same formula with night hours (sun below -6 degrees at the cell centre). Night has much less traffic,
  so the per-hour RR understates the per-vehicle risk; it is reported, and used only if it is > 1.
- Per segment: the condition with the highest RR whose lower bound is > 1 and with >= 3 crashes
  ("do not draw conclusions from one or two cases"). Night per segment is compared with the share of night crashes
  on the whole network instead of night hours (exposure-neutral).

Only crashes on the national network outside settlements. Weather flags exist for 2023-04-14 .. 2025-04-13.
Writes analysis.weather_rr and analysis.segment_weather.
"""
import numpy as np
import pandas as pd
from scipy.stats import chi2

from db import connect, read_sql, write_table

CONDITIONS = ["fog", "rain_heavy", "wind_strong", "ice"]
MIN_OBS = 10
SEG_MIN_OBS = 3
NIGHT_YEARS = (2021, 2024)


def poisson_ci(o, level=0.95):
    o = np.asarray(o, dtype=float)
    q = (1 - level) / 2
    low = np.where(o > 0, chi2.ppf(q, 2 * o) / 2, 0.0)
    high = chi2.ppf(1 - q, 2 * o + 2) / 2
    return low, high


def cell_hours(conn):
    h = read_sql(conn, """
        select wx_cell_id, condition, sum(hours)::float8 as hours from cell_condition_hours group by 1, 2""")
    h = h.pivot(index="wx_cell_id", columns="condition", values="hours").fillna(0)
    night = read_sql(conn, """
        select w.wx_cell_id, count(*) filter (where sun_elevation(w.ts_utc, c.lat, c.lon) < -6)::float8 as night
        from weather_hourly w join weather_cells_needed c using (wx_cell_id) group by 1""")
    return h.join(night.set_index("wx_cell_id"))


def network_crashes(conn):
    return read_sql(conn, """
        select crash_id, seg_id, wx_cell_id, year, severity, is_night,
               wx_fog as fog, wx_rain_heavy as rain_heavy, wx_wind_strong as wind_strong, wx_ice as ice
        from crashes where seg_id is not null and not in_settlement""")


def country_rr(cr, hours):
    rows = []
    win = cr[cr["fog"].notna()]                                   # weather window only
    for scope, sub in [("all", win), ("serious", win[win["severity"] != "damage"])]:
        per_cell = sub.groupby("wx_cell_id").agg(n=("crash_id", "size"), night=("is_night", "sum"),
                                                 **{k: (k, "sum") for k in CONDITIONS})
        per_cell = per_cell.join(hours, how="inner")             # hours columns are all, <condition>_h
        for k in CONDITIONS + ["night"]:
            hk = per_cell[f"{k}_h"]
            o = float(per_cell[k].sum())
            e = float((per_cell["n"] * hk / per_cell["all"]).sum())
            low, high = poisson_ci(o)
            rr = o / e if e > 0 else np.nan
            rows.append({"condition": k, "scope": scope, "observed": int(o), "expected": round(e, 1),
                         "rr": round(rr, 3), "ci_low": round(float(low) / e, 3), "ci_high": round(float(high) / e, 3)})
    out = pd.DataFrame(rows)
    ok = (out["ci_low"] > 1) & (out["observed"] >= MIN_OBS)
    out["multiplier"] = np.where(ok, out["rr"].round(2), 1.0)
    return out


def segment_factors(cr, hours):
    rows = []
    win = cr[cr["fog"].notna()]
    seg = win.groupby(["seg_id", "wx_cell_id"]).agg(n=("crash_id", "size"), **{k: (k, "sum") for k in CONDITIONS})
    seg = seg.reset_index().join(hours, on="wx_cell_id")
    for k in CONDITIONS:
        o = seg[k].astype(float)
        e = seg["n"] * seg[f"{k}_h"] / seg["all"]
        rows.append(pd.DataFrame({"seg_id": seg["seg_id"], "condition": k, "observed": o, "expected": e}))
    ny = cr[cr["year"].between(*NIGHT_YEARS)]
    share = ny["is_night"].mean()
    s = ny.groupby("seg_id").agg(n=("crash_id", "size"), o=("is_night", "sum")).reset_index()
    rows.append(pd.DataFrame({"seg_id": s["seg_id"], "condition": "night", "observed": s["o"].astype(float),
                              "expected": s["n"] * share}))
    f = pd.concat(rows, ignore_index=True)
    f = f[(f["observed"] >= SEG_MIN_OBS) & (f["expected"] > 0)]
    low, _ = poisson_ci(f["observed"])
    f["rr"] = (f["observed"] / f["expected"]).round(2)
    f["ci_low"] = (low / f["expected"]).round(2)
    f = f[f["ci_low"] > 1].sort_values("rr", ascending=False)
    f["observed"] = f["observed"].astype(int)
    f["expected"] = f["expected"].round(2)
    return f.drop_duplicates(["seg_id", "condition"]).reset_index(drop=True)


def run(conn):
    hours = cell_hours(conn)
    hours.columns = [c if c == "all" else f"{c}_h" for c in hours.columns]
    cr = network_crashes(conn)
    rr = country_rr(cr, hours)
    seg = segment_factors(cr, hours)
    write_table(conn, rr, "weather_rr", primary_key="condition, scope")
    write_table(conn, seg, "segment_weather", primary_key="seg_id, condition")
    return rr, seg


if __name__ == "__main__":
    with connect() as conn:
        rr, seg = run(conn)
    print(rr.to_string(index=False))
    print(seg["condition"].value_counts().to_string())
