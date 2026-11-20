"""Download hourly ERA5 weather (Open-Meteo archive, no key) for the weather cells; prints CSV for db/07_weather.sql.

PoC setting: 1° cells (~110 x 80 km), only cells that contain a crash snapped to a national road,
last two years of the crash data (2023-04-14 .. 2025-04-13). One request per cell; Open-Meteo counts it
as ~52 calls (>2 weeks of data), so the script paces itself under the free limit of 600 calls/minute.

Usage: python3 fetch_weather.py cells.txt > weather_hourly.csv
cells.txt: one "cell_id lat lon" per line (cell centre).  Standard library only.
"""
import csv
import json
import sys
import time
import urllib.error
import urllib.request

START, END = "2023-04-14", "2025-04-13"
VARS = ["temperature_2m", "dew_point_2m", "precipitation", "snowfall", "wind_gusts_10m", "cloud_cover", "cloud_cover_low"]
URL = ("https://archive-api.open-meteo.com/v1/archive?latitude={lat}&longitude={lon}"
       "&start_date=" + START + "&end_date=" + END + "&hourly=" + ",".join(VARS) + "&timezone=GMT")
PAUSE_S = 6   # ~52 calls per request -> ~520 calls/minute


def fetch(lat, lon):
    for _ in range(6):
        try:
            req = urllib.request.Request(URL.format(lat=lat, lon=lon), headers={"User-Agent": "safetycar-poc/1.0"})
            with urllib.request.urlopen(req, timeout=120) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            print(f"  HTTP {e.code} {e.read().decode('utf-8', 'replace')[:200]}", file=sys.stderr)
            if e.code != 429:
                raise
            time.sleep(65)
        except (urllib.error.URLError, TimeoutError) as e:
            print(f"  retry after {e}", file=sys.stderr)
            time.sleep(10)
    raise SystemExit("giving up")


def main(cells_path):
    cells = [line.split() for line in open(cells_path) if line.strip()]
    out = csv.writer(sys.stdout, lineterminator="\n")
    out.writerow(["wx_cell_id", "ts_utc"] + VARS)
    for n, (cell, lat, lon) in enumerate(cells, 1):
        t0 = time.time()
        h = fetch(lat, lon)["hourly"]
        for i, ts in enumerate(h["time"]):
            out.writerow([cell, ts + ":00+00"] + ["" if h[v][i] is None else h[v][i] for v in VARS])
        sys.stdout.flush()
        print(f"{n}/{len(cells)} {cell}: {len(h['time'])} hours", file=sys.stderr)
        if n < len(cells):
            time.sleep(max(0, PAUSE_S - (time.time() - t0)))


if __name__ == "__main__":
    main(sys.argv[1])
