"""Merge ptp_history_21to25.csv with the PTP_Layer shapefile into one CSV for db/01_crash_rows.sql.

Why both: the CSV has the exact time (hh:mm), the shapefile has the full-precision coordinates
(the CSV lost them to Excel scientific notation in 55,837 rows, e.g. 4.31426E+11 vs 43.1426249464).
Both files have the same 253,674 rows in the same order; the script checks date and hour on every row.

Usage: python scripts/prepare_crash_rows.py ptp_history_21to25.csv PTP_Layer.dbf > crash_rows.csv
Standard library only.
"""
import csv
import struct
import sys


def read_dbf(path):
    with open(path, "rb") as f:
        head = f.read(32)
        n, header_len, rec_len = struct.unpack("<IHH", head[4:12])
        fields = []
        while True:
            d = f.read(32)
            if d[0] == 0x0D:
                break
            fields.append((d[:11].split(b"\0")[0].decode(), d[16]))
        f.seek(header_len)
        for _ in range(n):
            rec = f.read(rec_len)
            pos, row = 1, {}
            for name, length in fields:
                row[name] = rec[pos:pos + length].decode("utf-8", "replace").strip()
                pos += length
            yield row


def num(s):
    """'4.25507300000e+01' -> '42.55073' (decimal text, trailing zeros removed); 0 -> ''."""
    if not s:
        return ""
    v = float(s)
    if v == 0:
        return ""
    t = f"{v:.10f}".rstrip("0").rstrip(".")
    return t


def main(csv_path, dbf_path):
    sys.stdout.reconfigure(encoding="utf-8", newline="")   # Windows defaults to cp1251
    out = csv.writer(sys.stdout, lineterminator="\n")
    out.writerow(["row_no", "year", "date", "time", "y_raw", "x_raw", "type", "injured", "died", "lat", "lon"])
    with open(csv_path, encoding="utf-8-sig", newline="") as f:
        rows = csv.DictReader(f)
        for i, (c, s) in enumerate(zip(rows, read_dbf(dbf_path)), start=1):
            d = c["date"]
            if s["date"] != d[6:] + d[3:5] + d[:2] or int(s["hour_int"]) != int(c["time"][:2]):
                sys.exit(f"row {i}: CSV and shapefile disagree ({c['date']} {c['time']} vs {s['date']} {s['hour_int']})")
            out.writerow([i, c["year"], c["date"], c["time"], c["y"], c["x"], c["type"].strip(),
                          c["injured"], c["died"], num(s["y"]), num(s["x"])])
    if i != 253674:
        print(f"note: {i} rows", file=sys.stderr)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
