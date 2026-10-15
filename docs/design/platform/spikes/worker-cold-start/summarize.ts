// Prints the median and p90 (nearest rank) of every cell in results/*.jsonl, in milliseconds.
// Usage: bun summarize.ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

type Sample = Record<string, unknown>;

function load(phase: string): Sample[] {
  return readFileSync(join('results', `${phase}.jsonl`), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Sample);
}

function pickPercentile(values: number[], fraction: number): number {
  const sorted = values.toSorted((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(fraction * sorted.length) - 1)] ?? Number.NaN;
}

function readField(sample: Sample, path: string): number | undefined {
  let value: unknown = sample;
  for (const key of path.split('.')) {
    value = (value as Record<string, unknown> | undefined)?.[key];
  }
  return typeof value === 'number' ? value : undefined;
}

function printRows(phase: string, groupKey: string, paths: string[], isGood: (s: Sample) => boolean) {
  const samples = load(phase),
    bad = samples.filter((sample) => !isGood(sample)).length;
  console.log(`\n## ${phase} (${bad} failed samples left out)\n`);
  console.log('| Group | Mode | Field | n | Median | p90 |');
  console.log('| --- | --- | --- | --: | --: | --: |');
  for (const group of new Set(samples.map((sample) => String(sample[groupKey])))) {
    for (const mode of ['cold', 'warm']) {
      const cell = samples.filter(
        (sample) => isGood(sample) && sample[groupKey] === group && sample.mode === mode,
      );
      for (const path of paths) {
        const values = cell
          .map((sample) => readField(sample, path))
          .filter((value) => value !== undefined);
        if (values.length > 0) {
          const median = pickPercentile(values, 0.5),
            p90 = pickPercentile(values, 0.9);
          console.log(`| ${group} | ${mode} | ${path} | ${values.length} | ${median} | ${p90} |`);
        }
      }
    }
  }
}

function isGoodTurn(sample: Sample): boolean {
  return sample.code === 0 && readField(sample, 'first_text.ms') !== undefined;
}

function isGoodFetch(sample: Sample): boolean {
  return sample.code === 0 && sample.reply === 'page 200';
}

printRows('start', 'image', ['totalMs'], (sample) => sample.code === 0);
printRows('fetch', 'route', ['frameMs', 'totalMs'], isGoodFetch);
printRows(
  'turn',
  'image',
  [
    'query.processStartMs',
    'query.arrivedMs',
    'init.ms',
    'first_text.ms',
    'first_text.arrivedMs',
    'result.apiMs',
  ],
  isGoodTurn,
);
