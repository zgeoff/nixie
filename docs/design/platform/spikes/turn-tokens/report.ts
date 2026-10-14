// Prints, for each run in runs/, the mean and the largest session's tokens and list-price cost, from
// the counting proxy's per-call usage. A session is one turn for the conversation, one query for
// the checker, one batch for the writer, and one run for the consolidator, a task and a worker.
//
//   bun report.ts
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { CallUsage } from './start-count-proxy';

// list prices in dollars per million tokens: input, cache read and output; a 5-minute cache write
// costs 1.25 times the input price and a 1-hour write 2 times
const prices: Record<string, { input: number; cacheRead: number; output: number }> = {
  'claude-opus-5-5': { input: 4, cacheRead: 0.2, output: 20 },
  'claude-sonnet-5-5': { input: 2, cacheRead: 0.2, output: 10 },
  'claude-haiku-5-5': { input: 0.1, cacheRead: 0.01, output: 0.5 },
};

interface Run {
  readonly role: string;
  readonly model: string;
  readonly effort: string;
  readonly sessions: readonly { label: string; calls: readonly CallUsage[]; error: string | null }[];
}

const dir = join(import.meta.dir, 'runs');
const files = (await readdir(dir)).filter((name) => name.endsWith('.json')).toSorted();
const rows: string[][] = [];

for (const file of files) {
  // oxlint-disable-next-line no-await-in-loop -- a handful of small files
  const run = (await Bun.file(join(dir, file)).json()) as Run;
  // a turn after the cache expired is reported on its own line, outside the warm means
  const sessions = run.sessions
    .filter((session) => !session.label.endsWith('-cold'))
    .map((session) => buildSessionTotals(session.calls));
  const cold = run.sessions.filter((session) => session.label.endsWith('-cold'));
  const mean = (pick: (totals: SessionTotals) => number) =>
    Math.round(sessions.reduce((sum, totals) => sum + pick(totals), 0) / sessions.length);
  const max = (pick: (totals: SessionTotals) => number) => Math.max(...sessions.map(pick));
  const failed = run.sessions.filter((session) => session.error !== null).length;

  rows.push([
    run.role,
    `${run.model.replace('claude-', '')} ${run.effort}`,
    String(sessions.length) + (failed > 0 ? ` (${failed} failed)` : ''),
    (sessions.reduce((sum, totals) => sum + totals.calls, 0) / sessions.length).toFixed(1),
    formatCount(mean((totals) => totals.input)),
    formatCount(mean((totals) => totals.cacheWrite)),
    formatCount(mean((totals) => totals.cacheRead)),
    formatCount(mean((totals) => totals.output)),
    formatCount(mean((totals) => totals.total)),
    formatCount(max((totals) => totals.total)),
    `$${(sessions.reduce((sum, totals) => sum + buildCost(run.model, totals), 0) / sessions.length).toFixed(4)}`,
    `$${Math.max(...sessions.map((totals) => buildCost(run.model, totals))).toFixed(4)}`,
  ]);
  for (const session of cold) {
    const totals = buildSessionTotals(session.calls);

    rows.push([
      `${run.role} (${session.label})`,
      `${run.model.replace('claude-', '')} ${run.effort}`,
      '1',
      String(totals.calls),
      formatCount(totals.input),
      formatCount(totals.cacheWrite),
      formatCount(totals.cacheRead),
      formatCount(totals.output),
      formatCount(totals.total),
      formatCount(totals.total),
      `$${buildCost(run.model, totals).toFixed(4)}`,
      `$${buildCost(run.model, totals).toFixed(4)}`,
    ]);
  }
}

const header = ['Role', 'Model', 'Sessions', 'Calls', 'Input', 'Cache write', 'Cached input', 'Output', 'Total', 'Largest', 'Cost', 'Largest cost'];

console.log(`| ${header.join(' | ')} |`);
console.log(`| ${header.map(() => '---').join(' | ')} |`);
for (const row of rows) {
  console.log(`| ${row.join(' | ')} |`);
}

interface SessionTotals {
  readonly calls: number;
  readonly input: number;
  readonly cacheWrite: number;
  readonly cacheWrite1h: number;
  readonly cacheRead: number;
  readonly output: number;
  readonly total: number;
}

function buildSessionTotals(calls: readonly CallUsage[]): SessionTotals {
  const sum = (pick: (call: CallUsage) => number) => calls.reduce((total, call) => total + pick(call), 0);
  const input = sum((call) => call.input);
  const cacheWrite = sum((call) => call.cacheWrite5m + call.cacheWrite1h);
  const cacheRead = sum((call) => call.cacheRead);
  const output = sum((call) => call.output);

  return {
    calls: calls.length,
    input,
    cacheWrite,
    cacheWrite1h: sum((call) => call.cacheWrite1h),
    cacheRead,
    output,
    total: input + cacheWrite + cacheRead + output,
  };
}

function buildCost(model: string, totals: SessionTotals): number {
  const price = prices[model];

  if (price === undefined) {
    return 0;
  }
  const write5m = totals.cacheWrite - totals.cacheWrite1h;

  return (
    (totals.input * price.input +
      write5m * price.input * 1.25 +
      totals.cacheWrite1h * price.input * 2 +
      totals.cacheRead * price.cacheRead +
      totals.output * price.output) /
    1_000_000
  );
}

function formatCount(count: number): string {
  return count.toLocaleString('en-US');
}
