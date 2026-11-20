"""Independent checks of schema analysis: recompute the stored results from the base tables. Read-only.

    .venv/bin/python tests/check_analysis.py

Covers Goal.md criteria 2 (one crash per group of people, sparse evidence flagged, scores reproducible) and 6
(validation numbers). Run after analysis/run.py.
"""
import json

import numpy as np
from scipy.stats import chi2

from common import ROOT, Report, connect, frame

MATRIX = {("high", "high"): 5, ("high", "uncertain"): 4, ("high", "low"): 2,
          ("medium", "high"): 5, ("medium", "uncertain"): 3, ("medium", "low"): 2,
          ("low", "high"): 5, ("low", "uncertain"): 2, ("low", "low"): 1}

r = Report()
c = connect()
df = lambda sql, p=None: frame(c, sql, p)  # noqa: E731

react = df("select * from analysis.reactive")
pro = df("select * from analysis.proactive")
scores = df("select * from analysis.segment_scores")
seg = df("select seg_id, road_class, carriageway, in_settlement, length_m::float8 as length_m from segments")

# --- keys and crash counting -----------------------------------------------------------------------------------------
r.check("one row per segment in reactive / proactive / segment_scores",
        len(react) == len(pro) == len(scores) == len(seg) == seg.seg_id.nunique(),
        f"{len(react)}, {len(pro)}, {len(scores)}, {len(seg)}")

cr = df("""select seg_id, count(*) filter (where severity <> 'damage') as s, count(*) as n,
                  count(*) filter (where severity = 'fatal') as f
           from crashes where seg_id is not null and not in_settlement and year between 2021 and 2024 group by 1""")
m = seg[["seg_id"]].merge(cr, how="left", on="seg_id").fillna(0).merge(
    react[["seg_id", "n_serious", "n_crashes", "n_fatal"]], on="seg_id")
bad = m[(m.s != m.n_serious) | (m.n != m.n_crashes) | (m.f != m.n_fatal)]
r.check("crash counts per segment == recount from the crashes table", len(bad) == 0, f"{len(bad)} mismatches")

d = df("""select (select count(*) from crash_rows) as rows_, (select sum(n_persons) from crashes) as persons""")
r.check("every person row belongs to exactly one crash (people in one crash count once)",
        int(d.rows_[0]) == int(d.persons[0]), d.to_dict("records"))
d = df("select year, count(*) filter (where severity <> 'damage') as serious from crashes where year in (2023, 2024) group by 1 order by 1")
r.check("serious crashes per year close to NSI (6,993 in 2023 / 7,173 in 2024)",
        abs(d.serious[0] - 6993) <= 30 and abs(d.serious[1] - 7173) <= 5, d.to_dict("records"))

# --- reactive ------------------------------------------------------------------------------------------------------------
m = react.merge(seg, on="seg_id")
a = m[m.assessed]
r.check("assessed == outside settlements", (m.assessed == ~m.in_settlement).all())
g = a.groupby("ref_group").agg(obs=("n_serious", "sum"), exp=("expected", "sum"))
r.check("NB expected totals per group within 5% of observed (NB-MLE does not force equality)",
        ((g.exp - g.obs).abs() <= 0.05 * g.obs + 1).all(), g.round(1).to_dict())
lo = np.minimum(a.expected, a.n_serious) - 1e-9
hi = np.maximum(a.expected, a.n_serious) + 1e-9
r.check("Empirical Bayes estimate lies between expected and observed", ((a.eb_estimate >= lo) & (a.eb_estimate <= hi)).all())

y = a.n_serious.astype(float)
q = 0.05                                                  # 90% two-sided
ci_low = np.where(y > 0, chi2.ppf(q, 2 * y) / 2, 0)
ci_high = chi2.ppf(1 - q, 2 * y + 2) / 2
level = np.select([(a.expected < ci_low) & (a.n_serious >= 3), a.expected > ci_high], ["high", "low"], "uncertain")
r.check("reactive_level recomputed from the Poisson confidence interval", (level == a.reactive_level).all(),
        f"{(level != a.reactive_level).sum()} mismatches")
r.check("not assessed -> reactive_level not_assessed", (m[~m.assessed].reactive_level == "not_assessed").all())
r.check("sparse evidence: fewer than 3 serious crashes is never 'high'",
        not ((a.n_serious < 3) & (a.reactive_level == "high")).any())
dom = react[react.dominant_type.notna()]
r.check("dominant crash type only with >= 5 crashes, >= 3 of that type, never 'other'",
        ((dom.n_crashes >= 5) & (dom.dominant_type_n >= 3) & (dom.dominant_type != "other")).all())

# --- proactive -----------------------------------------------------------------------------------------------------------
cmf = [col for col in pro.columns if col.startswith("cmf_")]
s = 100 / np.prod(pro[cmf].values, axis=1)
r.check("proactive_s == 100 / product(CMF)", np.allclose(s.round(1), pro.proactive_s, atol=0.11),
        f"max diff {np.abs(s - pro.proactive_s).max():.3f}")
lv = np.select([pro.proactive_s >= 80, pro.proactive_s >= 50], ["low", "medium"], "high")
r.check("proactive_level thresholds 80 / 50", (lv == pro.proactive_level).all())
r.check("every CMF >= 1 (an element never lowers the risk)", (pro[cmf] >= 1).all().all())

# --- class, score, priority ------------------------------------------------------------------------------------------------
x = scores.merge(seg, on="seg_id")
xa = x[x.assessed]
r.check("class == ДАБДП matrix(proactive_level, reactive_level)",
        all(MATRIX[(p, rl)] == cl for p, rl, cl in zip(xa.proactive_level, xa.reactive_level, xa["class"])))
r.check("not assessed -> class, score, priority_rank are null", x[~x.assessed][["class", "score", "priority_rank"]].isna().all().all())
r.check("score == 0.6 x reactive_pct + 0.4 x proactive_pct",
        np.allclose(xa.score, (0.6 * xa.reactive_pct + 0.4 * xa.proactive_pct).round(1), atol=0.051))
r.check("score within 0-100", xa.score.between(0, 100).all())
rank = xa.priority_rank.astype(int).sort_values().values
r.check("priority_rank is 1..N without gaps or duplicates", (rank == np.arange(1, len(rank) + 1)).all(), f"N={len(rank)}")

# --- reasons and fixes -----------------------------------------------------------------------------------------------------
r.check("at most 3 reasons per segment", (x.top_reasons.apply(len) <= 3).all())


def estimated_last(reasons):
    seen = False
    for item in reasons:
        if item["estimated"]:
            seen = True
        elif seen:
            return False
    return True


r.check("estimated reasons (road-class defaults) only after measured ones", x.top_reasons.apply(estimated_last).all())
rules = json.loads((ROOT / "analysis" / "config" / "fixes.json").read_text())["rules"]
missing = {i["key"] for rs in x.top_reasons for i in rs} - {f["reason"] for f in rules}
r.check("every reason that occurs has a fix rule", not missing, sorted(missing))
r.check("every fix belongs to one of the segment's reasons (or is the ДАБДП fallback)",
        x.apply(lambda row: all(f["reason"] is None or f["reason"] in [i["key"] for i in row.top_reasons]
                                for f in row.fixes), axis=1).all())
r.check("class >= 3 always has a fix", (x[x.assessed & (x["class"] >= 3)].fixes.apply(len) > 0).all())
r.check("class >= 4 always has a reason", (x[x.assessed & (x["class"] >= 4)].top_reasons.apply(len) > 0).all())
r.check("every reason has Bulgarian and English text", all(i["bg"] and i["en"] for rs in x.top_reasons for i in rs))

# --- weather ---------------------------------------------------------------------------------------------------------------
w = df("""with cr as (select wx_cell_id, count(*) as n, count(*) filter (where wx_fog) as o from crashes
                      where seg_id is not null and not in_settlement and wx_fog is not null group by 1),
               h as (select wx_cell_id, sum(hours) filter (where condition = 'all') as a,
                            sum(hours) filter (where condition = 'fog') as f from cell_condition_hours group by 1)
          select sum(o)::float8 as o, sum(n::float8 * f / a)::float8 as e from cr join h using (wx_cell_id)""")
fog = df("select rr from analysis.weather_rr where condition = 'fog' and scope = 'all'")
r.check("fog relative risk recomputed independently in SQL", abs(w.o[0] / w.e[0] - fog.rr[0]) < 0.002,
        f"{w.o[0] / w.e[0]:.3f} vs {fog.rr[0]}")
mu = df("select condition, rr, ci_low, observed, multiplier from analysis.weather_rr where scope = 'all'")
r.check("a multiplier > 1 only with enough evidence (lower bound > 1 and >= 10 crashes), else exactly 1",
        ((mu.multiplier > 1) == ((mu.ci_low > 1) & (mu.observed >= 10))).all() and (mu[mu.multiplier <= 1].multiplier == 1).all(),
        mu[["condition", "rr", "ci_low", "multiplier"]].to_dict("records"))
sw = df("select observed, ci_low from analysis.segment_weather")
r.check("per-segment weather factors need >= 3 crashes and lower bound > 1", ((sw.observed >= 3) & (sw.ci_low > 1)).all(),
        f"{len(sw)} rows")

# --- validation --------------------------------------------------------------------------------------------------------------
v = df("select metric, value from analysis.validation").set_index("metric").value
t = df("""select s.seg_id, coalesce(sum(y.n_fatal) filter (where y.year = 2024), 0) as f24,
                 coalesce(sum(y.n_fatal + y.n_injury) filter (where y.year between 2021 and 2023), 0) as s_tr,
                 coalesce(sum(y.n_crashes) filter (where y.year between 2021 and 2023), 0) as n_tr
          from segments s left join segment_year_stats y using (seg_id) where not s.in_settlement group by 1""")
g = t.groupby(["s_tr", "n_tr"]).agg(f=("f24", "sum"), n=("f24", "size")).sort_index(ascending=False)
budget, took = 0.1 * len(t), 0.0
for f_, n_ in zip(g.f, g.n):                              # ties at the cut-off count proportionally
    if budget <= 0:
        break
    frac = min(1, budget / n_)
    took += frac * f_
    budget -= frac * n_
base = took / t.f24.sum()
r.check("validation baseline recomputed (rank by past serious crashes, ties proportional)",
        abs(base - v["top10_baseline_fatal"]) < 0.002, f"{base:.4f} vs {v['top10_baseline_fatal']}")
r.check("validation test set = all 2024 fatal crashes on assessed segments", int(t.f24.sum()) == int(v["test_fatal_crashes"]),
        int(t.f24.sum()))

c.close()
r.finish("analysis")
