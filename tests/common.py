"""Shared helpers for the Python checks: database connection and a PASS/FAIL report with an exit code."""
import os
import sys
from pathlib import Path

import pandas as pd
import psycopg

ROOT = Path(__file__).resolve().parent.parent


def _setting(name):
    if os.environ.get(name):
        return os.environ[name]
    env = ROOT / ".env"
    if env.exists():
        for line in env.read_text().splitlines():
            if line.startswith(name + "="):
                return line.split("=", 1)[1].strip()
    return None


def database_url(write=False) -> str:
    """DATABASE_URL (environment or .env). For writing tests DATABASE_URL_WRITE wins if set: on the server
    DATABASE_URL is the read-only API role."""
    url = (write and _setting("DATABASE_URL_WRITE")) or _setting("DATABASE_URL")
    if not url:
        sys.exit("DATABASE_URL is not set (environment or .env)")
    return url


def connect(read_only=True) -> psycopg.Connection:
    opts = "-c statement_timeout=120000" + (" -c default_transaction_read_only=on" if read_only else "")
    return psycopg.connect(database_url(write=not read_only), connect_timeout=10, options=opts, autocommit=False)


def frame(conn, sql, params=None) -> pd.DataFrame:
    cur = conn.execute(sql, params)
    return pd.DataFrame(cur.fetchall(), columns=[d.name for d in cur.description])


class Report:
    def __init__(self):
        self.rows = []

    def check(self, name, ok, detail=""):
        self.rows.append(("PASS" if ok else "FAIL", name, detail))

    def finish(self, title):
        for status, name, detail in self.rows:
            print(f"{status}  {name}" + (f"   [{detail}]" if detail not in ("", None) else ""))
        failed = sum(r[0] == "FAIL" for r in self.rows)
        print(f"{title}: {len(self.rows) - failed} / {len(self.rows)} passed")
        sys.exit(1 if failed else 0)
