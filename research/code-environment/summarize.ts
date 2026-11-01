// Prints the program and probe tables from results/*.jsonl. Usage: bun summarize.ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { formatSummary } from './format-summary.ts';

process.stdout.write(formatSummary(readLines('programs'), readLines('probes')));

function readLines(file: string): Record<string, unknown>[] {
  return readFileSync(join('results', `${file}.jsonl`), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((text): unknown => JSON.parse(text))
    .filter((line): line is Record<string, unknown> => typeof line === 'object' && line !== null);
}
