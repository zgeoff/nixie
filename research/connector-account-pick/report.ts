// Scores an account-pick run. Usage: bun report.ts <out dir or .jsonl file> [--misses].
// buildRunScore scores each run over all its calls. The table counts the runs whose first call was
// right, and apart from that the runs with a wrong-account or an invalid call anywhere. An ask case
// passes when the model makes no call. An implied case names no account but its content points at
// one, so a right pick and a question both count as safe. A run whose CLI call failed counts as
// failed and stays out of every score. --misses prints each run that fails or holds an invalid call.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Call, Connection, RunScore } from './build-run-score.ts';
import { buildRunScore } from './build-run-score.ts';

interface Case {
  expect: string | null;
  id: string;
  kind: string;
  set: string;
}

interface Row {
  arm: string;
  calls: Call[];
  case: string;
  config: string;
  costUSD: number;
  durationMs: number;
  error?: string;
  reply: string;
  sample: number;
}

interface Tally {
  askRight: number;
  asks: number;
  cost: number;
  failed: number;
  finalRight: number;
  firstRight: number;
  impliedAsked: number;
  impliedRight: number;
  implieds: number;
  invalidRuns: number;
  named: number;
  namedPass: number;
  runs: number;
  wrongAccountRuns: number;
}

const input = process.argv[2] ?? '';
const showMisses = process.argv.includes('--misses');
const data = JSON.parse(readFileSync(join(import.meta.dir, 'cases.json'), 'utf8')) as {
  cases: Case[];
  sets: Record<string, { connections: Connection[] }>;
};
const rows = collectLatestRows(
  readFileSync(input.endsWith('.jsonl') ? input : join(input, 'results.jsonl'), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Row),
);
const tallies = new Map<string, Tally>();
const kinds = new Map<string, { right: number; runs: number }>();

for (const row of rows) {
  const item = getCase(row.case);
  const score = buildRunScore(item, data.sets[item.set]?.connections ?? [], row.arm, row.calls);
  const key = `${row.config} | ${row.arm}`;
  const tally = tallies.get(key) ?? buildTally();
  tallies.set(key, tally);
  tally.runs += 1;
  tally.cost += row.costUSD;
  if (row.error !== undefined) {
    tally.failed += 1;
    continue;
  }
  tally.invalidRuns += score.invalidCalls > 0 ? 1 : 0;
  tally.wrongAccountRuns += score.wrongAccountCalls > 0 ? 1 : 0;
  if (score.kind === 'ask') {
    tally.asks += 1;
    tally.askRight += score.pass ? 1 : 0;
  } else if (score.kind === 'implied') {
    tally.implieds += 1;
    tally.impliedRight += score.pass && score.first === 'right' ? 1 : 0;
    tally.impliedAsked += score.pass && score.first === 'none' ? 1 : 0;
  } else {
    tally.named += 1;
    tally.firstRight += score.first === 'right' ? 1 : 0;
    tally.namedPass += score.pass ? 1 : 0;
    tally.finalRight += score.final === 'right' ? 1 : 0;
  }
  const kindKey = `${key} | ${score.kind}`;
  const kind = kinds.get(kindKey) ?? { right: 0, runs: 0 };
  kind.runs += 1;
  kind.right += score.pass ? 1 : 0;
  kinds.set(kindKey, kind);
  if (showMisses && (!score.pass || score.invalidCalls > 0)) {
    printMiss(row, score);
  }
}

printTable();

// Keeps the last row for each run, so a run that failed and ran again counts once.
function collectLatestRows(all: Row[]): Row[] {
  const latest = new Map<string, Row>();
  for (const row of all) {
    latest.set([row.config, row.arm, row.case, row.sample].join('|'), row);
  }
  return [...latest.values()];
}

function getCase(id: string): Case {
  const found = data.cases.find((item) => item.id === id);
  if (!found) {
    throw new Error(`no case ${id}`);
  }
  return found;
}

function buildTally(): Tally {
  return {
    askRight: 0,
    asks: 0,
    cost: 0,
    failed: 0,
    finalRight: 0,
    firstRight: 0,
    impliedAsked: 0,
    impliedRight: 0,
    implieds: 0,
    invalidRuns: 0,
    named: 0,
    namedPass: 0,
    runs: 0,
    wrongAccountRuns: 0,
  };
}

function printMiss(row: Row, score: RunScore): void {
  const values = row.calls.map((call) => String(call.args.connection ?? '')).join(' > ');
  console.log(
    `MISS ${row.config} ${row.arm} ${row.case} sample ${row.sample}: first ${score.first}, ${score.wrongAccountCalls} wrong-account and ${score.invalidCalls} invalid calls [${values}]\n  ${row.reply.replaceAll('\n', ' ').slice(0, 240)}`,
  );
}

function formatShare(right: number, total: number): string {
  return total === 0 ? '-' : `${right}/${total} (${Math.round((100 * right) / total)}%)`;
}

function printTable(): void {
  console.log(
    '| Config and arm | Named: first call right | Named: passed | Named: final right | Runs with an invalid call | Runs with a wrong-account call | Ask cases: asked | Implied: right, asked | Failed runs | Runs | Cost |',
  );
  console.log('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const [key, tally] of [...tallies].toSorted(([a], [b]) => a.localeCompare(b))) {
    console.log(
      `| ${key} | ${formatShare(tally.firstRight, tally.named)} | ${formatShare(tally.namedPass, tally.named)} | ${formatShare(tally.finalRight, tally.named)} | ${tally.invalidRuns} | ${tally.wrongAccountRuns} | ${formatShare(tally.askRight, tally.asks)} | ${tally.impliedRight}, ${tally.impliedAsked} of ${tally.implieds} | ${tally.failed} | ${tally.runs} | $${tally.cost.toFixed(3)} |`,
    );
  }
  console.log('\nBy case kind (runs that pass):');
  for (const [key, kind] of [...kinds].toSorted(([a], [b]) => a.localeCompare(b))) {
    console.log(`  ${key}: ${formatShare(kind.right, kind.runs)}`);
  }
}
