"""Validation and pitch numbers.

Score built on 2021-2023 only -> where did the 2024 crashes happen? 2024 has ~99% located crashes, so it is the
cleanest test year (2025 stops in April).

- Share of 2024 fatal / serious crashes on our top 10% of segments (by score, and by the priority order),
  vs a naive baseline (rank by past serious crash count) and vs chance (10%).
- The Yambol stretch of A1 (the Nov 2026 fog pile-up is not in the data).
Only segments outside settlements (the ones that get a class). Writes analysis.validation.
"""
import numpy as np
import pandas as pd

import reactive
import weights
from db import connect, read_sql, write_table
from explain import MATRIX, W_PROACTIVE, W_REACTIVE, priority_key

TRAIN, TEST = (2021, 2023), 2024
TOP = 0.10


def top_share(df, order_cols, target, ascending=False):
    d = df.sort_values(order_cols, ascending=ascending)
    k = int(round(len(d) * TOP))
    total = d[target].sum()
    return float(d[target].iloc[:k].sum() / total) if total else np.nan


def top_share_km(df, order_cols, target):
    d = df.sort_values(order_cols, ascending=False)
    km = d["length_m"].cumsum() / d["length_m"].sum()
    total = d[target].sum()
    return float(d.loc[km <= TOP, target].sum() / total) if total else np.nan


def run(conn):
    train, _ = reactive.compute(reactive.load(conn, TRAIN), TRAIN)
    pro = read_sql(conn, "select * from analysis.proactive")
    test = read_sql(conn, """select seg_id, sum(n_fatal)::int as fatal_test, (sum(n_fatal) + sum(n_injury))::int as serious_test
                             from segment_year_stats where year = %s group by 1""", (TEST,))
    segs = read_sql(conn, "select seg_id, road, oblast, length_m::float8 as length_m from segments")
    df = train.merge(pro, on="seg_id").merge(test, on="seg_id", how="left").merge(segs[["seg_id", "road", "oblast"]], on="seg_id")
    df = df[df["assessed"]].fillna({"fatal_test": 0, "serious_test": 0}).copy()
    coef = weights.fit(df)                                              # weights from the training years only
    df["proactive_pct"] = weights.predict(df, coef).rank(pct=True) * 100
    df["proactive_s_pct"] = (100 - df["proactive_s"]).rank(pct=True) * 100
    df["score"] = W_REACTIVE * df["reactive_pct"] + W_PROACTIVE * df["proactive_pct"]
    df["class"] = [MATRIX[(p, r)] for p, r in zip(df["proactive_level"], df["reactive_level"])]
    df["priority_key"] = priority_key(df)

    rows = []

    def add(metric, value, note):
        rows.append({"metric": metric, "value": None if value is None else round(float(value), 4), "note": note})

    add("test_fatal_crashes", df["fatal_test"].sum(), f"fatal crashes {TEST} on assessed segments")
    add("test_serious_crashes", df["serious_test"].sum(), f"serious crashes {TEST} on assessed segments")
    add("segments_assessed", len(df), "segments outside settlements")
    for target in ["fatal_test", "serious_test"]:
        t = target.split("_")[0]
        add(f"top10_score_{t}", top_share(df, ["score"], target), f"share of {TEST} {t} crashes on top 10% segments by score (train {TRAIN[0]}-{TRAIN[1]})")
        add(f"top10_priority_{t}", top_share(df, ["priority_key"], target), "same, ranked like the 'fix these first' list")
        add(f"top10_km_score_{t}", top_share_km(df, ["score"], target), "same, top 10% of road length")
        add(f"top10_baseline_{t}", top_share(df, ["n_serious", "n_crashes"], target), "baseline: rank by past serious crash count")
        add(f"top10_reactive_only_{t}", top_share(df, ["reactive_pct"], target), "reactive part alone (EB crash density)")
        add(f"top10_proactive_only_{t}", top_share(df, ["proactive_pct"], target), "proactive part alone (road class + elements, NB weights)")
        add(f"top10_dabdp_s_only_{t}", top_share(df, ["proactive_s_pct"], target), "ДАБДП proactive S alone (no traffic proxy)")
    add("chance", TOP, "random 10% of segments")
    hi = df["class"] >= 4
    add("class45_share_segments", hi.mean(), "share of segments in class 4-5")
    add("class45_share_fatal", df.loc[hi, "fatal_test"].sum() / max(df["fatal_test"].sum(), 1), f"share of {TEST} fatal crashes on class 4-5")

    # Yambol stretch of A1, scored with the full model (analysis.segment_scores)
    y = read_sql(conn, """
        select x.seg_id, x.class, x.score, x.priority_rank, x.proactive_level, x.reactive_level
        from analysis.segment_scores x join segments s using (seg_id)
        where s.road = 'A1' and s.oblast = 'Ямбол' and x.assessed""")
    allsc = read_sql(conn, "select score from analysis.segment_scores where assessed")["score"]
    add("yambol_a1_segments", len(y), "A1 segments in Yambol oblast")
    add("yambol_a1_median_score", y["score"].median(), "median score (0-100)")
    add("yambol_a1_max_score", y["score"].max(), "max score")
    add("yambol_a1_share_top10", (y["score"] >= allsc.quantile(1 - TOP)).mean(), "share of its segments in the national top 10%")
    add("yambol_a1_class45", (y["class"] >= 4).sum(), "segments in class 4-5")
    out = pd.DataFrame(rows)
    write_table(conn, out, "validation", primary_key="metric")
    return out


if __name__ == "__main__":
    with connect() as conn:
        out = run(conn)
    print(out.to_string(index=False))
