"""Sums the orders per region through an SQLite database, then zips the report, with Python's own
modules. Usage: python3 report.py <orders.csv> <out dir>"""
import csv
import json
import sqlite3
import statistics
import sys
import zipfile
from pathlib import Path

input_path, out_dir = Path(sys.argv[1]), Path(sys.argv[2])
database = sqlite3.connect(out_dir / "orders.db")
database.execute(
    "CREATE TABLE orders (region TEXT, item TEXT, quantity INTEGER, unit_price_cents INTEGER)"
)
with input_path.open(newline="") as orders:
    database.executemany(
        "INSERT INTO orders VALUES (:region, :item, :quantity, :unit_price_cents)",
        csv.DictReader(orders),
    )

report = {}
for region, order_count, units, revenue_cents in database.execute(
    "SELECT region, COUNT(*), SUM(quantity), SUM(quantity * unit_price_cents)"
    " FROM orders GROUP BY region ORDER BY region"
):
    (top_item,) = database.execute(
        "SELECT item FROM orders WHERE region = ? GROUP BY item"
        " ORDER BY SUM(quantity) DESC, item LIMIT 1",
        (region,),
    ).fetchone()
    report[region] = {
        "orders": order_count,
        "revenue_cents": revenue_cents,
        "top_item": top_item,
        "units": units,
    }

quantities = [quantity for (quantity,) in database.execute("SELECT quantity FROM orders")]
if statistics.median(quantities) <= 0:
    raise SystemExit("the median quantity is not positive")

text = json.dumps(report, sort_keys=True, separators=(",", ":"))
with zipfile.ZipFile(out_dir / "report.zip", "w", zipfile.ZIP_DEFLATED) as archive:
    archive.writestr("report.json", text)
with zipfile.ZipFile(out_dir / "report.zip") as archive:
    if archive.read("report.json").decode() != text:
        raise SystemExit("the zip round trip changed the report")
print(text)
