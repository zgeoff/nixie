/* oxlint-disable max-statements, no-await-in-loop -- a throwaway spike that runs each candidate in turn */
// Runs bench.ts once per candidate per round in a fresh process, with every core and then pinned to
// 2 cores, and prints the median of each timing. Pass candidate IDs to run only those. Run it once
// with network access to fill the model folder; it then runs with OFFLINE=1, so a run proves every
// model loads from local files.
import path from 'node:path';
import { CANDIDATES } from './candidates.ts';

const ROUNDS = Number(process.env.ROUNDS ?? 3);
const ids = process.argv.length > 2 ? process.argv.slice(2) : CANDIDATES.map((candidate) => candidate.id);
const benchPath = path.join(import.meta.dir, 'bench.ts');

type Result = Record<string, unknown> & { id: string; threads: number };
const results: Result[] = [];

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
        break;
      }
      runs.push(JSON.parse(out.trim().split('\n').at(-1) ?? '{}') as Result);
    }
    if (runs.length > 0) {
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

function getMedian(values: number[]): number {
  const sorted = values.toSorted((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)] ?? Number.NaN;
}

function fix(value: unknown, digits: number): string {
  return Number(value).toFixed(digits);
}
