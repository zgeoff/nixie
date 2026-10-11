/* oxlint-disable max-statements, no-await-in-loop -- a throwaway spike that runs each candidate in turn */
// Runs bench.ts once per candidate per round in a fresh process, with every core and then pinned to
// 2 cores, and prints the median of each timing. Pass candidate IDs to run only those. It first
// loads each candidate once with the network on to fill the model folder, then times every round
// with OFFLINE=1, so a run proves every model loads from local files. A failed run exits nonzero.
import path from 'node:path';
import { CANDIDATES } from './candidates.ts';

const ROUNDS = Number(process.env.ROUNDS ?? 3);
const ids = process.argv.length > 2 ? process.argv.slice(2) : CANDIDATES.map((candidate) => candidate.id);
const benchPath = path.join(import.meta.dir, 'bench.ts');

type Result = Record<string, unknown> & { id: string; threads: number };
const results: Result[] = [];
let failed = false;

for (const id of ids) {
  const child = Bun.spawn(['bun', benchPath, id], { env: { ...process.env, PREFETCH: '1' }, stderr: 'pipe', stdout: 'ignore' });
  const [err, code] = await Promise.all([new Response(child.stderr).text(), child.exited]);
  if (code !== 0) {
    console.error(`${id} failed to load:\n${err.slice(-2000)}`);
    failed = true;
  }
}

for (const cores of ['all', '2'] as const) {
  for (const id of ids) {
    const runs: Result[] = [];
    for (let round = 0; round < ROUNDS; round += 1) {
      const command =
        cores === 'all' ? ['bun', benchPath, id] : ['taskset', '-c', '0,1', 'bun', benchPath, id];
      const child = Bun.spawn(command, {
        env: { ...process.env, OFFLINE: '1', THREADS: cores === 'all' ? '0' : '2' },
        stderr: 'pipe',
        stdout: 'pipe',
      });
      const [out, err, code] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ]);
      if (code !== 0) {
        console.error(`${id} on ${cores} cores failed:\n${err.slice(-2000)}`);
        failed = true;
        break;
      }
      runs.push(JSON.parse(out.trim().split('\n').at(-1) ?? '{}') as Result);
    }
    // a candidate with a failed round reports nothing, never a median of the rounds that passed
    if (runs.length === ROUNDS) {
      const merged = { ...runs[0], cores } as Result;
      for (const key of ['batchMsPerItem', 'loadMs', 'rssLoadedMB', 'rssPeakMB', 'singleMsMedian', 'singleMsP90']) {
        merged[key] = getMedian(runs.map((run) => Number(run[key])));
      }
      results.push(merged);
      console.error(`done ${id} on ${cores} cores`);
    }
  }
}

console.log('| Candidate | Cores | Load ms | Query ms | Batch ms/item | RSS loaded MB | RSS peak MB | 30 pairs | 75 msg R@5 | 75 kw R@5 | MRR msg |');
console.log('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
for (const row of results) {
  const message = row.questionsMessage as { recall: number; mrr: number },
    keywords = row.questionsKeywords as { recall: number };
  console.log(
    `| ${row.id} | ${String(row.cores)} | ${fix(row.loadMs, 0)} | ${fix(row.singleMsMedian, 1)} | ${fix(row.batchMsPerItem, 2)} | ${String(row.rssLoadedMB)} | ${String(row.rssPeakMB)} | ${fix(Number(row.pairRecall) * 30, 0)}/30 | ${fix(message.recall, 2)} | ${fix(keywords.recall, 2)} | ${fix(message.mrr, 2)} |`,
  );
}

if (failed) {
  process.exit(1);
}

function getMedian(values: number[]): number {
  const sorted = values.toSorted((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)] ?? Number.NaN;
}

function fix(value: unknown, digits: number): string {
  return Number(value).toFixed(digits);
}
