"""Weights for the proactive part of the score, from a negative binomial regression (association, not causation).

serious crashes ~ reference group (road class, a stand-in for traffic) + log(CMF) of each road element,
with exposure = km x years. Elements whose coefficient comes out <= 0 are dropped and the model is refitted:
on these data they are confounded with traffic (quiet roads are the narrow, winding ones) and a negative weight
would say "sharp bends make a road safer". The ДАБДП S score and the top reasons still use all elements.

Why this exists: a percentile of S alone ranks quiet III-class roads first and put only 3% of the 2024 fatal
crashes in its top 10% (worse than chance). The fitted model turns road class + elements into an expected
crash density that is comparable across classes.

Writes analysis.weights (term, coef). predict() is used by explain.py and validate.py.
"""
import numpy as np
import pandas as pd
import statsmodels.api as sm

from db import connect, read_sql, write_table
from proactive import ELEMENTS

CMF_COLS = [f"cmf_{e}" for e in ELEMENTS]


def design(df, terms=None):
    X = pd.get_dummies(df["ref_group"]).astype(float)
    L = np.log(df[CMF_COLS].astype(float))
    X = pd.concat([X, L], axis=1)
    return X if terms is None else X.reindex(columns=terms, fill_value=0.0)


def fit(df):
    """df: assessed segments with ref_group, n_serious, exposure and cmf_* columns."""
    X = design(df)
    keep = [c for c in CMF_COLS if X[c].std() > 0]
    groups = [c for c in X.columns if c not in CMF_COLS]
    while True:
        Xk = X[groups + keep]
        res = sm.NegativeBinomial(df["n_serious"].to_numpy(float), Xk.to_numpy(), exposure=df["exposure"].to_numpy(float)
                                  ).fit(disp=0, maxiter=300)
        coef = pd.Series(res.params[:-1], index=Xk.columns)
        neg = [c for c in keep if coef[c] <= 0]
        if not neg:
            break
        keep = [c for c in keep if c not in neg]
    coef["alpha"] = res.params[-1]
    return coef


def predict(df, coef):
    """Expected serious crashes per km-year from road class + road elements."""
    terms = [t for t in coef.index if t != "alpha"]
    return pd.Series(np.exp(design(df, terms).to_numpy() @ coef[terms].to_numpy()), index=df.index)


def load(conn):
    df = read_sql(conn, """select r.seg_id, r.assessed, r.ref_group, r.n_serious, r.exposure, p.*
                           from analysis.reactive r join analysis.proactive p using (seg_id)""")
    return df.loc[:, ~df.columns.duplicated()]


def run(conn):
    df = load(conn)
    coef = fit(df[df["assessed"]])
    out = pd.DataFrame({"term": coef.index, "coef": coef.values.round(4)})
    write_table(conn, out, "weights", primary_key="term")
    return coef


if __name__ == "__main__":
    with connect() as conn:
        print(run(conn).round(3).to_string())
