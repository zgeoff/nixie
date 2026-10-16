// Prints, for each run in runs/, the cold first turn, the mean warm turn and the turn after the pause,
// then prices a bursty day under each cache lifetime from the warm turns' measured shape.
//
//   bun report.ts
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { CallUsage } from './start-count-proxy';

// Opus 5.5 list prices in dollars per million tokens, as the token use spike's report holds them; a
// 5-minute cache write costs 1.25 times the input price and a 1-hour write 2 times
const price = { input: 4, write5m: 5, write1h: 8, cacheRead: 0.2, output: 20 };

interface Run {
  readonly arm: string;
  readonly pauseSeconds: number;
  readonly turns: readonly { label: string; startedAt: string; calls: readonly CallUsage[]; error: string | null }[];
}

interface Totals {
  readonly calls: number;
  readonly input: number;
  readonly write5m: number;
  readonly write1h: number;
  readonly read: number;
  readonly output: number;
  readonly cost: number;
}

const dir = join(import.meta.dir, 'runs');
const files = (await readdir(dir)).filter((name) => name.endsWith('.json')).toSorted();
const rows: string[][] = [];
const warmTurns: Totals[] = [];

for (const file of files) {
  // oxlint-disable-next-line no-await-in-loop -- a handful of small files
  const run = (await Bun.file(join(dir, file)).json()) as Run;
  const failed = run.turns.filter((turn) => turn.error !== null || turn.calls.length === 0);

  if (failed.length > 0 || run.turns.length !== 8) {
    throw new Error(`${file} holds failed or missing turns: ${failed.map((turn) => turn.label).join(', ')}`);
  }
  const totals = run.turns.map((turn) => sumCalls(turn.calls));

  // turns 2 to 6 and 8 each follow the turn before at once; turn 7 follows the pause
  const warm = [...totals.slice(1, 6), totals[7]!];

  warmTurns.push(...warm);
  rows.push(
    buildRow(file.replace(".json", ""), 'first turn', totals[0]!),
    buildRow(file.replace(".json", ""), 'warm, mean of 6', meanTotals(warm)),
    buildRow(file.replace(".json", ""), `after ${run.pauseSeconds} s`, totals[6]!),
  );
}

printTable(['Run', 'Turn', 'Calls', 'Input', 'Write 5m', 'Write 1h', 'Cached', 'Output', 'Cost'], rows);

const shape = meanTotals(warmTurns);
const newTokens = shape.write5m + shape.write1h;

console.log(
  `\nwarm turn shape over ${warmTurns.length} turns: ${shape.calls.toFixed(2)} calls, ${Math.round(newTokens)} tokens written, ${Math.round(shape.output)} output`,
);
printTable(
  ['Day', 'Context', '5m', '1h, no gap in 5-60 min', '1h, half', '1h, every gap', 'Break-even share'],
  [
    buildDayRow('ordinary: 50 turns in 15 bursts', 50, 15, 100_000),
    buildDayRow('heavy: 100 turns in 25 bursts', 100, 25, 180_000),
  ],
);

function sumCalls(calls: readonly CallUsage[]): Totals {
  const sum = (pick: (call: CallUsage) => number) => calls.reduce((total, call) => total + pick(call), 0);
  const counts = {
    calls: calls.length,
    input: sum((call) => call.input),
    write5m: sum((call) => call.cacheWrite5m),
    write1h: sum((call) => call.cacheWrite1h),
    read: sum((call) => call.cacheRead),
    output: sum((call) => call.output),
  };

  return {
    ...counts,
    cost:
      (counts.input * price.input +
        counts.write5m * price.write5m +
        counts.write1h * price.write1h +
        counts.read * price.cacheRead +
        counts.output * price.output) /
      1_000_000,
  };
}

function meanTotals(list: readonly Totals[]): Totals {
  const mean = (pick: (totals: Totals) => number) => list.reduce((total, item) => total + pick(item), 0) / list.length;

  return {
    calls: mean((item) => item.calls),
    input: mean((item) => item.input),
    write5m: mean((item) => item.write5m),
    write1h: mean((item) => item.write1h),
    read: mean((item) => item.read),
    output: mean((item) => item.output),
    cost: mean((item) => item.cost),
  };
}

function buildRow(arm: string, turn: string, totals: Totals): string[] {
  const format = (value: number) => Math.round(value).toLocaleString('en-US');

  return [
    arm,
    turn,
    totals.calls.toFixed(1),
    format(totals.input),
    format(totals.write5m),
    format(totals.write1h),
    format(totals.read),
    format(totals.output),
    `$${totals.cost.toFixed(4)}`,
  ];
}

// A day's turns each read the context once per call and write their new tokens, and each burst that
// starts cold writes the whole context once instead of reading it. Under 5 minutes every burst starts
// cold. Under 1 hour the day's first burst starts cold, and a later burst starts cold only when the
// gap before it passes the hour; warmShare is the share of gaps between bursts that stay within it.
function buildDayRow(day: string, turns: number, bursts: number, context: number): string[] {
  const buildDayCost = (write: number, coldStarts: number) =>
    (turns * (shape.calls * context * price.cacheRead + newTokens * write + shape.output * price.output) +
      coldStarts * context * (write - price.cacheRead)) /
    1_000_000;
  const shortCost = buildDayCost(price.write5m, bursts);
  const buildLongCost = (warmShare: number) => buildDayCost(price.write1h, 1 + (bursts - 1) * (1 - warmShare));

  // the long lifetime's cost falls linearly in the warm share, so one division finds where it meets
  const breakEven = (buildLongCost(0) - shortCost) / (buildLongCost(0) - buildLongCost(1));

  return [
    day,
    context.toLocaleString('en-US'),
    `$${shortCost.toFixed(2)}`,
    `$${buildLongCost(0).toFixed(2)}`,
    `$${buildLongCost(0.5).toFixed(2)}`,
    `$${buildLongCost(1).toFixed(2)}`,
    `${Math.round(breakEven * 100)}%`,
  ];
}

function printTable(head: readonly string[], body: readonly (readonly string[])[]): void {
  console.log(`| ${head.join(' | ')} |`);
  console.log(`| ${head.map(() => '---').join(' | ')} |`);
  for (const row of body) {
    console.log(`| ${row.join(' | ')} |`);
  }
}
