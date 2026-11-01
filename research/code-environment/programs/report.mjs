// Sums the orders per region, then checks a gzip round trip and a SHA-256 digest of the report
// with Node's own modules. Usage: node report.mjs <orders.csv> <out dir>
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';

const [inputPath, outDir] = process.argv.slice(2);
const [, ...rows] = readFileSync(inputPath, 'utf8').trim().split('\n');
const regions = new Map();
for (const row of rows) {
  const [, region, item, quantity, unitPriceCents] = row.split(',');
  const totals = regions.get(region) ?? { orders: 0, revenueCents: 0, units: 0, items: new Map() };
  totals.orders += 1;
  totals.units += Number(quantity);
  totals.revenueCents += Number(quantity) * Number(unitPriceCents);
  totals.items.set(item, (totals.items.get(item) ?? 0) + Number(quantity));
  regions.set(region, totals);
}

const report = {};
for (const region of [...regions.keys()].toSorted()) {
  const totals = regions.get(region);
  const [topItem] = [...totals.items].toSorted(
    ([leftItem, leftUnits], [rightItem, rightUnits]) =>
      rightUnits - leftUnits || leftItem.localeCompare(rightItem),
  )[0];
  report[region] = {
    orders: totals.orders,
    revenue_cents: totals.revenueCents,
    top_item: topItem,
    units: totals.units,
  };
}

const text = JSON.stringify(report);
const gzipped = gzipSync(text);
writeFileSync(join(outDir, 'report.json.gz'), gzipped);
if (gunzipSync(readFileSync(join(outDir, 'report.json.gz'))).toString() !== text) {
  throw new Error('the gzip round trip changed the report');
}
writeFileSync(join(outDir, 'report.sha256'), createHash('sha256').update(text).digest('hex'));
console.log(text);
