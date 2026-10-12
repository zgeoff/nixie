/* oxlint-disable max-statements -- a throwaway spike that prints the whole report in one place */
// Prints the wrong-confirmation and miss rates for each results file, with each error listed.
//
//   bun report.ts results/*.jsonl
import { type CallRecord, loadRecords } from './run.ts';

if (import.meta.main) {
  for (const path of process.argv.slice(2)) {
    printReport(loadRecords(path));
  }
}

function printReport(records: CallRecord[]): void {
  const model = records[0]?.model ?? 'no records';
  const positives = records.filter((record) => record.asserted);
  const negatives = records.filter((record) => !record.asserted);
  const wrong = negatives.filter((record) => record.verdict === 'asserted');
  const missed = positives.filter((record) => record.verdict !== 'asserted');
  const latencies = records.map((record) => record.latencyMs).toSorted((a, b) => a - b);
  const cost = records.reduce((sum, record) => sum + record.costUSD, 0);

  console.log(`## ${model}: ${records.length} calls, $${cost.toFixed(4)}`);
  console.log(
    `wrong confirmations: ${wrong.length} of ${negatives.length} calls (${formatRate(wrong.length, negatives.length)})`,
  );
  console.log(
    `misses: ${missed.length} of ${positives.length} calls (${formatRate(missed.length, positives.length)}), ` +
      `${missed.filter((record) => record.verdict === 'unsure').length} of them unsure`,
  );
  const flips = countFlips(records);
  console.log(`pairs whose verdict changed across repeats: ${flips} of ${groupByPair(records).size}`);
  console.log(
    `latency p50 ${getPercentile(latencies, 0.5)} ms, p95 ${getPercentile(latencies, 0.95)} ms, max ${latencies.at(-1)} ms`,
  );
  for (const [bucket, rows] of groupBy(records, (record) => record.bucket)) {
    const errors = rows.filter((record) => (record.verdict === 'asserted') !== record.asserted);
    console.log(`  ${rows[0]?.asserted ? '+' : '-'} ${bucket}: ${errors.length} of ${rows.length} wrong`);
  }
  for (const record of [...wrong, ...missed].toSorted((a, b) => a.pair.localeCompare(b.pair))) {
    console.log(`  ${record.pair}#${record.repeat} ${record.verdict}: ${record.memory}`);
    console.log(`      ${record.reason}`);
  }
  console.log('');
}

function formatRate(count: number, total: number): string {
  return `${((count / total) * 100).toFixed(1)}%`;
}

function countFlips(records: CallRecord[]): number {
  return [...groupByPair(records).values()].filter(
    (rows) => new Set(rows.map((record) => record.verdict)).size > 1,
  ).length;
}

function groupByPair(records: CallRecord[]): Map<string, CallRecord[]> {
  return groupBy(records, (record) => record.pair);
}

function groupBy(records: CallRecord[], key: (record: CallRecord) => string): Map<string, CallRecord[]> {
  const groups = new Map<string, CallRecord[]>();
  for (const record of records) {
    groups.set(key(record), [...(groups.get(key(record)) ?? []), record]);
  }
  return groups;
}

function getPercentile(sorted: number[], share: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor(share * sorted.length))] ?? 0;
}
