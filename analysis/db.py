"""Database helpers shared by the analysis modules.

Connection string: DATABASE_URL from the environment, or from the project's .env file.
All results go to schema "analysis"; the pipeline tables in "public" are only read.
"""
import json
import os
from pathlib import Path

import pandas as pd
import psycopg

ROOT = Path(__file__).resolve().parent.parent


def database_url() -> str:
    url = os.environ.get("DATABASE_URL")
    if url:
        return url
    env = ROOT / ".env"
    if env.exists():
        for line in env.read_text().splitlines():
            if line.startswith("DATABASE_URL="):
                return line.split("=", 1)[1].strip()
    raise SystemExit("DATABASE_URL is not set (environment or .env)")


def connect() -> psycopg.Connection:
    return psycopg.connect(database_url(), connect_timeout=10)


def read_sql(conn: psycopg.Connection, sql: str, params=None) -> pd.DataFrame:
    with conn.cursor() as cur:
        cur.execute(sql, params)
        cols = [d.name for d in cur.description]
        return pd.DataFrame(cur.fetchall(), columns=cols)


PG_TYPES = {"int64": "bigint", "Int64": "bigint", "int32": "integer", "Int32": "integer",
            "float64": "double precision", "Float64": "double precision", "float32": "real",
            "bool": "boolean", "boolean": "boolean", "object": "text", "string": "text"}


def write_table(conn: psycopg.Connection, df: pd.DataFrame, table: str, jsonb_cols=(), primary_key=None) -> None:
    """Replace analysis.<table> with the contents of df (one transaction, COPY)."""
    cols = []
    for name, dtype in df.dtypes.items():
        pg = "jsonb" if name in jsonb_cols else PG_TYPES.get(str(dtype), "text")
        cols.append(f'"{name}" {pg}')
    pk = f", primary key ({primary_key})" if primary_key else ""
    with conn.transaction():
        conn.execute("create schema if not exists analysis")
        conn.execute(f"drop table if exists analysis.{table} cascade")
        conn.execute(f"create table analysis.{table} ({', '.join(cols)}{pk})")
        json_idx = {i for i, c in enumerate(df.columns) if c in jsonb_cols}
        names = ", ".join(f'"{c}"' for c in df.columns)
        with conn.cursor().copy(f"copy analysis.{table} ({names}) from stdin") as cp:
            for row in df.itertuples(index=False):
                cp.write_row([_cell(v, i in json_idx) for i, v in enumerate(row)])


def _cell(v, is_json):
    if is_json:
        return None if v is None else json.dumps(v, ensure_ascii=False)
    if v is None or (not isinstance(v, (list, dict, str)) and pd.isna(v)):
        return None
    return v.item() if hasattr(v, "item") else v
