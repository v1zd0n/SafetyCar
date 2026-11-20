"""Final class, score, top 3 reasons and fixes per segment.

- Class 1-5 from the ДАБДП matrix (proactive level x reactive level). Segments inside settlements have no reactive
  assessment, so no class and no score (the map shows them grey), but they still get reasons and fixes.
- Continuous score 0-100 = W_REACTIVE x reactive_pct + W_PROACTIVE x proactive_pct, where reactive_pct ranks the
  EB crash density and proactive_pct ranks the crash density expected from road class + elements (weights.py).
  The frontend can recompute it with sliders from the two percentiles.
- Top 3 reasons, in this order of evidence: the over-represented crash type, the weather factor, the road elements
  with the biggest CMF (measured ones), many night crashes, "more serious crashes than normal", and only if there
  is still room, elements that carry just a road-class default (estimated = true).
- Fixes from config/fixes.json, one per reason; the ДАБДП fallback (signs and markings) for class >= 3 without any.

Writes analysis.segment_scores.
"""
import json
from pathlib import Path

import numpy as np
import pandas as pd

import weights
from db import connect, read_sql, write_table

W_REACTIVE, W_PROACTIVE = 0.6, 0.4
CFG = Path(__file__).parent / "config"
REASONS = json.loads((CFG / "reasons.json").read_text())
FIXES = json.loads((CFG / "fixes.json").read_text())
FIX_BY_REASON = {r["reason"]: r for r in FIXES["rules"]}
ROAD_ELEMENTS = ["curvature", "access_points", "junctions", "roadside", "lane_width", "shoulder", "overtaking",
                 "vulnerable_users", "markings", "speed_undivided"]

# ДАБДП matrix: (proactive, reactive) -> priority class (5 = very high ... 1 = very low)
MATRIX = {("high", "high"): 5, ("high", "uncertain"): 4, ("high", "low"): 2,
          ("medium", "high"): 5, ("medium", "uncertain"): 3, ("medium", "low"): 2,
          ("low", "high"): 5, ("low", "uncertain"): 2, ("low", "low"): 1}
PRIORITY = {5: "very_high", 4: "high", 3: "medium", 2: "low", 1: "very_low"}

FEATURE_DETAIL = {   # column, unit, decimals: shown next to a road reason
    "curvature": ("curvature_deg_per_km", "°/km", 0), "access_points": ("access_per_km", "/km", 1),
    "junctions": ("junctions_per_km", "/km", 1), "roadside": ("roadside_obstacle_share", "", 2),
    "lane_width": ("lane_width_m", " m", 2), "speed_undivided": ("speed_limit", " km/h", 0),
}


def load(conn):
    df = read_sql(conn, """
        select s.seg_id, s.in_settlement, r.assessed, r.ref_group, r.exposure, r.reactive_level, r.reactive_pct,
               r.n_crashes, r.n_serious, r.excess, r.expected, r.dominant_type, r.dominant_type_ratio, r.dominant_type_n,
               p.*, f.curvature_deg_per_km, f.access_per_km, f.junctions_per_km, f.roadside_obstacle_share,
               f.lane_width_m, f.speed_limit
        from segments s join analysis.reactive r using (seg_id) join analysis.proactive p using (seg_id)
        join segment_features f using (seg_id)""")
    df = df.loc[:, ~df.columns.duplicated()]
    weather = read_sql(conn, "select * from analysis.segment_weather")
    w = read_sql(conn, "select term, coef from analysis.weights")
    return df, weather, pd.Series(w["coef"].to_numpy(float), index=w["term"])


def reason(key, detail=None, strength=None, estimated=False):
    """estimated = the value is only a road-class default, not measured for this segment."""
    r = REASONS[key]
    return {"key": key, "source": r["source"], "bg": r["bg"], "en": r["en"], "detail": detail,
            "strength": None if strength is None else round(float(strength), 2), "estimated": estimated}


def reasons_for(row, wx):
    out = []
    if isinstance(row.dominant_type, str):
        out.append(reason(f"crash_type:{row.dominant_type}",
                          f"{int(row.dominant_type_n)} / {int(row.n_crashes)} ПТП, {row.dominant_type_ratio:.1f}x",
                          row.dominant_type_ratio))
    w = wx[wx["condition"] != "night"]
    if len(w):
        b = w.iloc[0]
        out.append(reason(f"weather:{b.condition}", f"{b.observed} ПТП, {b.rr:.1f}x", b.rr))
    imputed = set(row.imputed_elements or [])
    elements = sorted(((getattr(row, f"cmf_{e}"), e) for e in ROAD_ELEMENTS
                       if e not in imputed and getattr(row, f"cmf_{e}") > 1.0), reverse=True)
    for cmf, e in elements:
        col, unit, dec = FEATURE_DETAIL.get(e, (None, "", 0))
        val = getattr(row, col) if col else None
        detail = f"{val:.{dec}f}{unit}" if val is not None and not pd.isna(val) else None
        out.append(reason(e, detail, cmf))
    n = wx[wx["condition"] == "night"]
    if len(n):
        out.append(reason("night", f"{n.iloc[0].observed} ПТП, {n.iloc[0].rr:.1f}x", n.iloc[0].rr))
    if row.reactive_level == "high":
        out.append(reason("crash_history", f"{int(row.n_serious)} тежки ПТП vs {row.expected:.1f} очаквани", None))
    # last resort: elements that only carry a road-class default, marked as estimated
    for cmf, e in sorted(((getattr(row, f"cmf_{e}"), e) for e in ROAD_ELEMENTS
                          if e in imputed and getattr(row, f"cmf_{e}") > 1.0), reverse=True):
        out.append(reason(e, "оценка за класа на пътя", cmf, estimated=True))
    seen, top = set(), []
    for r in out:
        if r["key"] not in seen:
            seen.add(r["key"])
            top.append(r)
    return top[:3]


def fixes_for(reasons, cls):
    out, seen = [], set()
    for r in reasons:
        f = FIX_BY_REASON.get(r["key"])
        if f and f["en"] not in seen:
            seen.add(f["en"])
            out.append({"reason": r["key"], "bg": f["bg"], "en": f["en"], "basis": f["basis"], "cost": f["cost"]})
    if not out and cls is not None and cls >= 3:
        fb = FIXES["fallback"]
        out.append({"reason": None, "bg": fb["bg"], "en": fb["en"], "basis": fb["basis"], "cost": fb["cost"]})
    return out


def priority_key(df):
    """'Fix these first': class 5 (crash history clearly above normal) first, by excess serious crashes
    (EB-shrunk, so short pieces don't win); then everything else by score. Ranking all classes strictly by class
    caught only 15% of the 2024 fatal crashes in the top 10% (validate.py)."""
    return np.where(df["class"].fillna(0).astype(int) == 5, 1000 + df["excess"].fillna(0), df["score"].fillna(-1))


def compute(df, weather, coef):
    df = df.copy()
    # proactive part of the 0-100 score: expected serious crashes per km-year from road class + elements (weights.py)
    df["proactive_density"] = weights.predict(df, coef)
    df["proactive_pct"] = (df.loc[df["assessed"], "proactive_density"].rank(pct=True) * 100).round(1)
    cls = [MATRIX.get((p, r)) if a else None
           for p, r, a in zip(df["proactive_level"], df["reactive_level"], df["assessed"])]
    df["class"] = pd.array(cls, dtype="Int64")
    df["priority"] = df["class"].map(PRIORITY)
    df["score"] = np.where(df["assessed"],
                           (W_REACTIVE * df["reactive_pct"] + W_PROACTIVE * df["proactive_pct"]).round(1), np.nan)
    wx_by_seg = {k: g for k, g in weather.groupby("seg_id")}
    empty = weather.iloc[0:0]
    top, fixes, wf, wrr = [], [], [], []
    for row, c in zip(df.itertuples(index=False), df["class"]):
        wx = wx_by_seg.get(row.seg_id, empty)
        rs = reasons_for(row, wx)
        top.append(rs)
        fixes.append(fixes_for(rs, None if pd.isna(c) else int(c)))
        w = wx[wx["condition"] != "night"]
        wf.append(w.iloc[0].condition if len(w) else None)
        wrr.append(float(w.iloc[0].rr) if len(w) else None)
    df["top_reasons"], df["fixes"], df["weather_factor"], df["weather_rr"] = top, fixes, wf, wrr
    df["priority_key"] = priority_key(df)
    order = df[df["assessed"]].sort_values("priority_key", ascending=False)
    df["priority_rank"] = pd.Series(np.arange(1, len(order) + 1), index=order.index).reindex(df.index).astype("Int64")
    return df[["seg_id", "assessed", "class", "priority", "score", "priority_rank", "reactive_level", "reactive_pct",
               "proactive_level", "proactive_s", "proactive_pct", "proactive_density", "dominant_type", "weather_factor", "weather_rr",
               "top_reasons", "fixes"]]


def run(conn):
    df, weather, coef = load(conn)
    out = compute(df, weather, coef)
    write_table(conn, out, "segment_scores", jsonb_cols=("top_reasons", "fixes"), primary_key="seg_id")
    return out


if __name__ == "__main__":
    with connect() as conn:
        out = run(conn)
    print(out["priority"].value_counts(dropna=False).to_string())
    print(out.sort_values("priority_rank").head(3)[["seg_id", "class", "score", "top_reasons"]].to_string())
