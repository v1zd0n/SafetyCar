"""Reactive score: what has already happened on each segment.

Method (RoadEvalGuidelines.docx + docs/data-aggregation.md):
- Only crashes with injuries or deaths ("serious"), outside settlements, years 2021-2024.
  Segments that are mostly inside settlements are not assessed (ДАБДП leaves out town sections).
- Reference group = road class (+ carriageway for dual roads). Exposure = segment km x years.
- ДАБДП label: exact Poisson confidence interval of the segment's count vs the group's expected count
  -> high / uncertain / low. "high" also needs >= MIN_HIGH serious crashes (sparse evidence stays uncertain).
- Negative binomial model per group + Empirical Bayes -> expected "true" count. reactive_pct ranks the EB crash
  density; excess = EB - group mean is kept for the "fix these first" order.
- Crash-type over-representation vs the group (segments with >= 5 crashes of any severity).

No location-coverage correction here: every comparison is between segments over the same years, so the
(spatially uniform, assumed) missing locations cancel out. Absolute per-year numbers for display can be scaled
with public.crash_coverage.

Writes analysis.reactive.
"""
import sys

import numpy as np
import pandas as pd
import statsmodels.api as sm
from scipy.stats import chi2

from db import connect, read_sql, write_table

YEARS = (2021, 2024)
CI_LEVEL = 0.90          # two-sided; 90% is less strict than 95% for 3-4 years of data
MIN_HIGH = 3             # "high" needs at least 3 serious crashes: 1-2 cases stay "uncertain" (sparse evidence,
                         # RoadEvalGuidelines: no conclusions from one or two cases; Goal.md criterion 2)
MIN_TYPE_CRASHES = 5     # crash-type over-representation only for segments with at least this many crashes
TYPE_RATIO = 1.5         # a type is "dominant" if its share is >= 1.5x the group's share ...
TYPE_MIN_N = 3           # ... and it happened at least 3 times
MIN_GROUP = 50           # smaller reference groups are merged into their road class

TYPE_GROUPS = ["rear_end", "side", "angle", "head_on", "run_off_road", "rollover", "pedestrian", "cyclist",
               "parked", "animal_cart", "obstacle", "train", "other"]


def load(conn, years):
    segs = read_sql(conn, """
        select seg_id, road, road_class, carriageway, length_m::float8 as length_m, in_settlement
        from segments""")
    type_cols = ", ".join(f"sum(n_{t})::int as n_{t}" for t in TYPE_GROUPS)
    stats = read_sql(conn, f"""
        select seg_id, sum(n_crashes)::int as n_crashes, sum(n_fatal)::int as n_fatal, sum(n_injury)::int as n_injury,
               sum(n_killed)::int as n_killed, sum(epdo)::int as epdo, {type_cols}
        from segment_year_stats where year between %s and %s group by seg_id""", years)
    return segs.merge(stats, on="seg_id", how="left").fillna({c: 0 for c in stats.columns if c != "seg_id"})


def reference_group(df):
    g = df["road_class"] + np.where(df["carriageway"] == "dual", "-dual", "")
    size = g.map(g.value_counts())
    # small groups join the biggest group of the same road class
    biggest = g.groupby(df["road_class"]).agg(lambda s: s.value_counts().idxmax())
    return g.where(size >= MIN_GROUP, df["road_class"].map(biggest))


def fit_group(y, exposure):
    """Intercept-only negative binomial with exposure; returns (rate per km-year, alpha)."""
    if y.sum() == 0:
        return 0.0, 0.0
    try:
        res = sm.NegativeBinomial(y, np.ones((len(y), 1)), exposure=exposure).fit(disp=0, maxiter=200)
        rate, alpha = float(np.exp(res.params[0])), float(res.params[-1])
        if not np.isfinite(alpha) or alpha < 0:
            raise ValueError
        return rate, alpha
    except Exception:                      # fall back to method of moments
        rate = y.sum() / exposure.sum()
        mu = rate * exposure
        alpha = max(0.0, (((y - mu) ** 2 - y).sum()) / (mu ** 2).sum())
        return float(rate), float(alpha)


def compute(df, years):
    n_years = years[1] - years[0] + 1
    df = df.copy()
    df["assessed"] = ~df["in_settlement"].astype(bool)
    df["ref_group"] = reference_group(df)
    df["n_serious"] = (df["n_fatal"] + df["n_injury"]).astype(int)
    df["exposure"] = df["length_m"] / 1000 * n_years                   # km-years

    df["expected"] = np.nan
    df["eb_estimate"] = np.nan
    a = df[df["assessed"]]
    groups = {}
    for g, sub in a.groupby("ref_group"):
        rate, alpha = fit_group(sub["n_serious"].to_numpy(float), sub["exposure"].to_numpy(float))
        mu = rate * sub["exposure"]
        w = 1 / (1 + alpha * mu)
        df.loc[sub.index, "expected"] = mu
        df.loc[sub.index, "eb_estimate"] = w * mu + (1 - w) * sub["n_serious"]
        groups[g] = {"rate_per_km_year": rate, "alpha": alpha, "segments": len(sub)}

    # ДАБДП decision rule: where does the group's expected count fall relative to the segment's CI?
    y = df["n_serious"].to_numpy(float)
    q = (1 - CI_LEVEL) / 2
    df["ci_low"] = np.where(y > 0, chi2.ppf(q, 2 * y) / 2, 0.0)
    df["ci_high"] = chi2.ppf(1 - q, 2 * y + 2) / 2
    df["reactive_level"] = np.select(
        [~df["assessed"], (df["expected"] < df["ci_low"]) & (df["n_serious"] >= MIN_HIGH), df["expected"] > df["ci_high"]],
        ["not_assessed", "high", "low"], "uncertain")

    df["excess"] = df["eb_estimate"] - df["expected"]
    df["excess_per_km_year"] = df["excess"] / df["exposure"]
    df["serious_per_km_year"] = df["n_serious"] / df["exposure"]
    df["eb_per_km_year"] = df["eb_estimate"] / df["exposure"]
    # the score uses the EB crash density (where serious crashes are expected), not the excess over the class:
    # ranking by excess hides busy roads that are "only average" for their class (validated in validate.py).
    # The excess is kept for the "fix these first" order (potential for improvement).
    df["reactive_pct"] = (df.loc[df["assessed"], "eb_per_km_year"].rank(pct=True) * 100).round(1)

    # crash-type over-representation vs the reference group
    tcols = [f"n_{t}" for t in TYPE_GROUPS]
    group_share = a.groupby("ref_group")[tcols].sum()
    group_share = group_share.div(group_share.sum(axis=1), axis=0)
    seg_share = df[tcols].div(df["n_crashes"].replace(0, np.nan), axis=0)
    ratio = seg_share / group_share.reindex(df["ref_group"]).set_axis(df.index).replace(0, np.nan)
    ok = (df["n_crashes"] >= MIN_TYPE_CRASHES).to_numpy()[:, None] & (df[tcols].to_numpy() >= TYPE_MIN_N)
    ratio = ratio.where(ok)
    ratio["n_other"] = np.nan          # "other / unknown type" is not a finding anyone can act on
    best = ratio.fillna(0).idxmax(axis=1)
    best_ratio = ratio.max(axis=1)          # NaN when no type qualifies
    has = best_ratio >= TYPE_RATIO
    df["dominant_type"] = best.where(has).str.removeprefix("n_")
    df["dominant_type_ratio"] = best_ratio.where(has).round(2)
    df["dominant_type_n"] = [int(df.at[i, b]) if h else None for i, b, h in zip(df.index, best, has)]
    return df, groups


COLUMNS = ["seg_id", "assessed", "ref_group", "n_crashes", "n_serious", "n_fatal", "n_killed", "epdo", "exposure",
           "serious_per_km_year", "expected", "eb_estimate", "eb_per_km_year", "excess", "excess_per_km_year",
           "ci_low", "ci_high",
           "reactive_level", "reactive_pct", "dominant_type", "dominant_type_ratio", "dominant_type_n"]


def run(conn, years=YEARS, table="reactive"):
    df, groups = compute(load(conn, years), years)
    out = df[COLUMNS].copy()
    out["dominant_type_n"] = out["dominant_type_n"].astype("Int64")
    write_table(conn, out, table, primary_key="seg_id")
    return out, groups


if __name__ == "__main__":
    with connect() as conn:
        out, groups = run(conn)
    for g, v in sorted(groups.items()):
        print(f"{g:8s} rate {v['rate_per_km_year']:.3f}/km/yr  alpha {v['alpha']:.2f}  n={v['segments']}")
    print(out["reactive_level"].value_counts().to_string())
    print("dominant types:", out["dominant_type"].value_counts().head(6).to_dict())
    sys.exit(0)
