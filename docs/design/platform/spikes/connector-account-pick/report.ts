// Scores an account-pick run. Usage: bun report.ts <out dir or .jsonl file>
// [--misses]. A named case scores the first call's `connection` value, and the value the last
// successful call passed. An ask case passes when the model makes no call. An implied case names
// no account but its content points at one, so a right pick and a question both count as safe.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

interface Connection {
  account: string | null;
  id: string;
  label: string;
}

interface Case {
  expect: string | null;
  id: string;
  kind: string;
  set: string;
}

interface Call {
  args: { connection?: unknown };
  error: boolean;
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
}

interface Score {
  final: 'right' | 'wrong' | 'none';
  first: 'right' | 'wrong-account' | 'invalid' | 'none';
  kind: string;
}

interface Tally {
  askRight: number;
  asks: number;
  cost: number;
  finalRight: number;
  firstRight: number;
  impliedAsked: number;
  impliedRight: number;
  implieds: number;
  invalid: number;
  named: number;
  runs: number;
  wrongAccount: number;
}

const input = process.argv[2] ?? '',
  showMisses = process.argv.includes('--misses'),
  data = JSON.parse(readFileSync(join(import.meta.dir, 'cases.json'), 'utf8')) as {
    cases: Case[];
    sets: Record<string, { connections: Connection[] }>;
  },
  rows = readFileSync(input.endsWith('.jsonl') ? input : join(input, 'results.jsonl'), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Row),
  tallies = new Map<string, Tally>(),
  kinds = new Map<string, { right: number; runs: number }>();

for (const row of rows) {
  const score = buildScore(row),
    key = `${row.config} | ${row.arm}`,
    tally = tallies.get(key) ?? buildTally();
  tally.runs += 1;
  tally.cost += row.costUSD;
  if (score.kind === 'ask') {
    tally.asks += 1;
    tally.askRight += score.first === 'none' ? 1 : 0;
  } else if (score.kind === 'implied') {
    tally.implieds += 1;
    tally.impliedRight += score.first === 'right' ? 1 : 0;
    tally.impliedAsked += score.first === 'none' ? 1 : 0;
  } else {
    tally.named += 1;
    tally.firstRight += score.first === 'right' ? 1 : 0;
    tally.finalRight += score.final === 'right' ? 1 : 0;
    tally.invalid += score.first === 'invalid' ? 1 : 0;
    tally.wrongAccount += score.first === 'wrong-account' ? 1 : 0;
  }
  const kindKey = `${key} | ${score.kind}`,
    kind = kinds.get(kindKey) ?? { right: 0, runs: 0 };
  kind.runs += 1;
  kind.right += isPass(score) ? 1 : 0;
  kinds.set(kindKey, kind);
  tallies.set(key, tally);
  if (showMisses && !isPass(score)) {
    printMiss(row, score);
  }
}

printTable();

function buildTally(): Tally {
  return {
    askRight: 0,
    asks: 0,
    cost: 0,
    finalRight: 0,
    firstRight: 0,
    impliedAsked: 0,
    impliedRight: 0,
    implieds: 0,
    invalid: 0,
    named: 0,
    runs: 0,
    wrongAccount: 0,
  };
}

function buildScore(row: Row): Score {
  const item = getCase(row.case),
    connections = data.sets[item.set]?.connections ?? [],
    toValue = (connection: Connection): string =>
      row.arm === 'label' ? connection.label : connection.id,
    allowed = connections.map(toValue),
    target = connections.find((connection) => connection.label === item.expect),
    expected = target ? toValue(target) : null,
    first = row.calls[0],
    lastGood = row.calls.findLast((call) => !call.error);
  if (item.expect === null) {
    return { final: lastGood ? 'wrong' : 'none', first: first ? 'wrong-account' : 'none', kind: 'ask' };
  }
  let firstScore: Score['first'] = 'none';
  if (first) {
    const value = String(first.args.connection ?? '');
    if (value === expected) {
      firstScore = 'right';
    } else {
      firstScore = allowed.includes(value) ? 'wrong-account' : 'invalid';
    }
  }
  let finalScore: Score['final'] = 'none';
  if (lastGood) {
    finalScore = String(lastGood.args.connection ?? '') === expected ? 'right' : 'wrong';
  }
  return { final: finalScore, first: firstScore, kind: item.kind };
}

function isPass(score: Score): boolean {
  if (score.kind === 'ask') {
    return score.first === 'none';
  }
  if (score.kind === 'implied') {
    return score.first === 'right' || score.first === 'none';
  }
  return score.first === 'right';
}

function getCase(id: string): Case {
  const found = data.cases.find((item) => item.id === id);
  if (!found) {
    throw new Error(`no case ${id}`);
  }
  return found;
}

function formatShare(right: number, total: number): string {
  return total === 0 ? '-' : `${right}/${total} (${Math.round((100 * right) / total)}%)`;
}

function printMiss(row: Row, score: Score): void {
  const values = row.calls.map((call) => String(call.args.connection ?? '')).join(' > ');
  console.log(
    `MISS ${row.config} ${row.arm} ${row.case}: first ${score.first}, calls [${values}]${row.error ? ` error ${row.error}` : ''}\n  ${row.reply.replaceAll('\n', ' ').slice(0, 240)}`,
  );
}

function printTable(): void {
  console.log(
    '| Config and arm | Named: first call right | Named: final right | Invalid value | Wrong account | Ask cases: asked | Implied: right, asked | Runs | Cost |',
  );
  console.log('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const [key, tally] of [...tallies].toSorted(([a], [b]) => a.localeCompare(b))) {
    console.log(
      `| ${key} | ${formatShare(tally.firstRight, tally.named)} | ${formatShare(tally.finalRight, tally.named)} | ${tally.invalid} | ${tally.wrongAccount} | ${formatShare(tally.askRight, tally.asks)} | ${tally.impliedRight}, ${tally.impliedAsked} of ${tally.implieds} | ${tally.runs} | $${tally.cost.toFixed(3)} |`,
    );
  }
  console.log('\nBy case kind (passes, as isPass scores them):');
  for (const [key, kind] of [...kinds].toSorted(([a], [b]) => a.localeCompare(b))) {
    console.log(`  ${key}: ${formatShare(kind.right, kind.runs)}`);
  }
}
