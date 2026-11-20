"""Proactive score: dangers in the road itself, before any crash (ДАБДП method).

Each segment starts at 100 safety units; every road element multiplies it by RF = 1 / CMF (config/cmf.json).
S >= 80 -> low risk, 50-80 -> medium, < 50 -> high.

Elements whose value is only a road-class default (*_imputed) still count in S, so S stays comparable,
but they are marked as imputed and never shown as a top reason.

Writes analysis.proactive (one row per segment, one cmf_<element> column per element).
"""
import json
from pathlib import Path

import numpy as np
import pandas as pd

from db import connect, read_sql, write_table

CFG = json.loads((Path(__file__).parent / "config" / "cmf.json").read_text())
ELEMENTS = ["lane_width", "roadside", "curvature", "access_points", "junctions", "vulnerable_users",
            "shoulder", "overtaking", "markings", "speed_undivided"]


def load(conn):
    return read_sql(conn, """
        select s.seg_id, s.road_class, s.carriageway, s.settlement_share::float8 as settlement_share,
               f.lanes, f.lane_width_m::float8 as lane_width_m, f.lane_width_imputed, f.shoulder_type, f.shoulder_imputed,
               f.has_overtaking_lane, f.overtaking_imputed, f.has_sidewalk, f.sidewalk_imputed,
               f.marking_quality, f.speed_limit, f.speed_limit_imputed, f.is_divided,
               f.roadside_obstacle_share::float8 as roadside_obstacle_share,
               f.curvature_deg_per_km::float8 as curvature_deg_per_km, f.access_per_km::float8 as access_per_km,
               f.junctions_per_km::float8 as junctions_per_km, f.crossings_per_km::float8 as crossings_per_km
        from segments s join segment_features f using (seg_id)""")


def banded(values, cfg):
    """First band whose upper bound is above the value wins; bands are sorted ascending.
    Works for both directions: for lower_is_worse elements the small values simply carry the big CMFs."""
    v = pd.to_numeric(values, errors="coerce")
    out = pd.Series(cfg["else"], index=v.index, dtype=float)
    done = pd.Series(False, index=v.index)
    for bound, cmf in cfg["bands"]:
        hit = ~done & (v < bound)
        out[hit] = cmf
        done |= hit
    return out.where(v.notna(), 1.0)


def compute(df):
    df = df.copy()
    c = {}
    single = (df["carriageway"] == "single") & ~df["is_divided"].fillna(False).astype(bool)

    lw = CFG["lane_width"]
    width = df["lane_width_m"].where(df["lane_width_m"] >= lw["valid_min"])     # e.g. 0.17 m is a data error
    width = width.fillna(df.groupby("road_class")["lane_width_m"].transform("median"))
    c["lane_width"] = banded(width, lw)
    c["roadside"] = banded(df["roadside_obstacle_share"], CFG["roadside"])
    c["curvature"] = banded(df["curvature_deg_per_km"], CFG["curvature"])
    c["access_points"] = banded(df["access_per_km"], CFG["access_points"])
    c["junctions"] = banded(df["junctions_per_km"], CFG["junctions"])

    vu = CFG["vulnerable_users"]
    side = np.where(df["has_sidewalk"].fillna(False).astype(bool), vu["sidewalk_factor"], 1.0)
    crossings = np.minimum(vu["crossing_cap"], vu["per_crossing"] * df["crossings_per_km"].fillna(0))
    c["vulnerable_users"] = np.where(single, 1 + vu["settlement_weight"] * df["settlement_share"].fillna(0) * side + crossings, 1.0)

    sh = CFG["shoulder"]
    c["shoulder"] = df["shoulder_type"].map(sh["map"]).fillna(sh["else"])
    no_overtaking = single & (df["lanes"].fillna(2) <= 2) & ~df["has_overtaking_lane"].fillna(False).astype(bool) \
        & (df["speed_limit"].fillna(0) >= 80)
    c["overtaking"] = np.where(no_overtaking, CFG["overtaking"]["cmf_if_missing"], 1.0)
    c["markings"] = np.where(df["marking_quality"].isna(), CFG["markings"]["cmf_unknown"], 1.0)
    su = CFG["speed_undivided"]
    c["speed_undivided"] = np.where(single & (df["speed_limit"].fillna(0) >= su["min_speed"]), su["cmf"], 1.0)

    imputed = {
        "lane_width": df["lane_width_imputed"].fillna(True) | df["lane_width_m"].lt(lw["valid_min"]),
        "shoulder": df["shoulder_imputed"].fillna(True),
        "overtaking": df["overtaking_imputed"].fillna(True),
        "vulnerable_users": df["sidewalk_imputed"].fillna(True) & df["crossings_per_km"].fillna(0).eq(0),
        "markings": pd.Series(True, index=df.index),
        "speed_undivided": df["speed_limit_imputed"].fillna(True),
    }

    out = pd.DataFrame({"seg_id": df["seg_id"]})
    for e in ELEMENTS:
        out[f"cmf_{e}"] = np.round(np.asarray(c[e], dtype=float), 3)
    cmf_product = np.prod([out[f"cmf_{e}"] for e in ELEMENTS], axis=0)
    out["proactive_s"] = np.round(100 / cmf_product, 1)
    out["proactive_level"] = np.select([out["proactive_s"] >= 80, out["proactive_s"] >= 50], ["low", "medium"], "high")
    # proactive_pct for the 0-100 score is NOT a percentile of S (see weights.py); explain.py computes it
    out["imputed_elements"] = [
        [e for e in imputed if bool(imputed[e].iloc[i])] for i in range(len(df))]
    return out


def run(conn):
    out = compute(load(conn))
    write_table(conn, out, "proactive", jsonb_cols=("imputed_elements",), primary_key="seg_id")
    return out


if __name__ == "__main__":
    with connect() as conn:
        out = run(conn)
    print(out["proactive_level"].value_counts().to_string())
    print(out["proactive_s"].describe().round(1).to_string())
    print(out[[c for c in out.columns if c.startswith("cmf_")]].mean().round(3).to_string())
