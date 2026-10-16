// Prints median and p90 (nearest rank) for every cell in results/*.jsonl, in milliseconds.
// Usage: bun summarize.ts
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

type Sample = Record<string, unknown>;

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

function printRow(label: string, samples: Sample[], path: string): void {
  const values = samples
    .map((sample) => readField(sample, path))
    .filter((value) => value !== undefined);
  if (values.length > 0) {
    const median = pickPercentile(values, 0.5),
      p90 = pickPercentile(values, 0.9);
    console.log(`| ${label} | ${path} | ${values.length} | ${median} | ${p90} |`);
  }
}

function load(phase: string): Sample[] {
  return readFileSync(join('results', `${phase}.jsonl`), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Sample);
}

// A turn counts only when it exited 0, its MCP server connected, and it produced text.
function isGoodTurn(sample: Sample): boolean {
  const init = sample.init as { mcp?: string[] } | undefined;
  return (
    sample.code === 0 &&
    sample.first_text !== undefined &&
    (init?.mcp ?? []).every((status) => status === 'connected')
  );
}

// Every cell holds turns except the lifecycle ones, so a turn cell drops failed turns.
function printCell(label: string, samples: Sample[], paths: string[]): void {
  const good = /^(?:e2e|sdk)/u.test(label)
    ? samples.filter((sample) => isGoodTurn(sample))
    : samples;
  if (good.length !== samples.length) {
    console.log(`| ${label} | dropped | ${samples.length - good.length} | | |`);
  }
  for (const path of paths) {
    printRow(label, good, path);
  }
}

const cells: Record<string, string[]> = {
    cli: ['lsMs'],
    'e2e-new': [
      'newMs',
      'grantMs',
      'query.arrivedMs',
      'init.arrivedMs',
      'first_text.arrivedMs',
      'result.arrivedMs',
      'query.processStartMs',
      'init.ms',
      'first_text.ms',
    ],
    'e2e-wake': [
      'query.arrivedMs',
      'init.arrivedMs',
      'first_text.arrivedMs',
      'result.arrivedMs',
      'query.processStartMs',
      'init.ms',
      'first_text.ms',
    ],
    lifecycle: ['newMs', 'execMs', 'toAnswerMs', 'grantMs'],
    wake: ['sleepMs', 'wakeMs', 'execMs', 'toAnswerMs'],
  },
  phases = new Set(
    readdirSync('results')
      .filter((name) => name.endsWith('.jsonl'))
      .map((name) => name.replace(/\.jsonl$/u, '')),
  ),
  turnFields = [
    'query.processStartMs',
    'init.ms',
    'first_text.ms',
    'result.ms',
    'result.apiMs',
    'first_text.arrivedMs',
  ];

console.log('| cell | field | n | median ms | p90 ms |');
console.log('| --- | --- | --- | --- | --- |');
for (const [phase, paths] of Object.entries(cells)) {
  if (phases.has(phase)) {
    printCell(phase, load(phase), paths);
  }
}
if (phases.has('sdk')) {
  const samples = load('sdk');
  for (const placement of ['host', 'imp']) {
    for (const tools of [0, 1, 3]) {
      const cell = samples.filter(
        (sample) => sample.placement === placement && sample.tools === tools,
      );
      printCell(`sdk ${placement} tools=${tools}`, cell, turnFields);
    }
  }
}
