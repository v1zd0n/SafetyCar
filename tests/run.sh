#!/usr/bin/env bash
# Run the three pass/fail checks. Exit code 0 = everything passed.
#   bash tests/run.sh                      local API at http://localhost:8787/api
#   bash tests/run.sh https://safetycar.invent2025.org/api
# Needs: .venv (analysis/requirements.txt), Node 20+, DATABASE_URL (.env), a running API for the last check.
set -u
cd "$(dirname "$0")/.."
PY=${PYTHON:-.venv/bin/python}
API=${1:-${API_URL:-http://localhost:8787/api}}
status=0

echo "== analysis (read-only)";               $PY tests/check_analysis.py        || status=1
echo; echo "== live scenarios (rolled back)";  $PY tests/check_live_scenarios.py  || status=1
echo; echo "== api: $API";                     node tests/check_api.mjs "$API"    || status=1

echo; [ $status -eq 0 ] && echo "ALL PASSED" || echo "SOMETHING FAILED (see FAIL lines above)"
exit $status
