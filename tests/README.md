# Tests

Checks for the analysis and the backend. They need the real database (`DATABASE_URL` in `.env`), so they are run
by hand, e.g. before a deploy or the demo, not on GitHub.

```bash
bash tests/run.sh                                          # all three checks, local API (start it: cd backend && npm start)
bash tests/run.sh https://safetycar.invent2025.org/api      # same, API checks against the server
```

Exit code 0 means everything passed; failures are printed as `FAIL` lines with the reason.

| File | What it checks | Writes? |
|---|---|---|
| `check_analysis.py` | Recomputes the stored analysis from the base tables: crash counts and grouping (people in one crash count once), the ДАБДП high / uncertain / low rule, sparse evidence (< 3 serious crashes is never "high"), proactive S and levels, the class matrix, the 0-100 score, the priority order, reasons and fixes, the fog multiplier, the validation numbers. 31 checks. *Goal.md 2, 6* | no (read-only) |
| `check_live_scenarios.py` | The Goal.md live cases with made-up data: restriction over 12 t (car / exactly 12 t / 18 t / mass unspecified), full closure, expired and future events, stale АПИ feed → unknown, fog multiplier applied, ice multiplier neutral, stale and missing weather shown, MeteoAlarm warning. 16 checks. *Goal.md 3, 4* | inside one transaction that is **always rolled back**; needs a role that may write (`DATABASE_URL_WRITE` if set) |
| `check_api.mjs` | Every endpoint with valid and invalid input (bad tile coordinates, junk parameters, SQL-injection-like ids, Cyrillic, limits, filters, malformed JSON). ~60 checks | no (safe against production) |
| `perf_live.py` | Diagnostic: timing of the live "risk now" query and its parts | no |
| `load_api.mjs` | Diagnostic: bursts of parallel requests; not against production during the demo. A few `500`s on the "priorities + road profile" burst against the **local Docker** database are its small `/dev/shm`, not the code (see `docs/backend-setup.md`, local development note) | no |

Single files: `.venv/bin/python tests/check_analysis.py`, `node tests/check_api.mjs [base-url]`, or
`cd backend && npm test` (API checks against the local server).

Run `check_analysis.py` after `analysis/run.py`, and `check_live_scenarios.py` after `npm run setup-db`.
Some checks compare with known numbers of this dataset (e.g. NSI serious-crash totals for 2023 and 2024); after a
data change that moves them on purpose, update the check.
