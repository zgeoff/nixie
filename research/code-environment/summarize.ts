// Prints the program table (median and p90, nearest rank, in milliseconds) and the probe table from
// results/*.jsonl. Usage: bun summarize.ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

type Line = Record<string, unknown>;

const programRuns = readLines('programs');
const probeRuns = readLines('probes');

console.log('## Programs\n');
console.log('| Image | Program | Code runs | Right | Total median | Total p90 | Program median | Program p90 |');
console.log('| --- | --- | --: | --: | --: | --: | --: | --: |');
for (const image of new Set(programRuns.map((run) => String(run.image)))) {
  for (const program of new Set(programRuns.map((run) => String(run.program)))) {
    const cell = programRuns.filter((run) => run.image === image && run.program === program);
    const good = cell.filter((run) => run.code === 0 && run.matches === true).length;
    const runMs = collectNumbers(cell, 'runMs');
    const programMs = collectNumbers(cell, 'programMs');
    console.log(
      `| ${image} | ${program} | ${cell.length} | ${good} | ${pickPercentile(runMs, 0.5)} | ${pickPercentile(runMs, 0.9)} | ${pickPercentile(programMs, 0.5)} | ${pickPercentile(programMs, 0.9)} |`,
    );
  }
}

console.log('\n## Probes\n');
console.log('| Image | Probe | Exit | Program ms | Error or last line |');
console.log('| --- | --- | --: | --: | --- |');
for (const probe of probeRuns) {
  // npm's last line names its log file, so the first error line says more.
  const lines = String(probe.output).split('\n');
  const lastLine = lines.find((line) => /ERR!|ERROR|Error|error:/.test(line)) ?? lines.at(-1) ?? '';
  console.log(
    `| ${String(probe.image)} | ${String(probe.probe)} | ${String(probe.code)} | ${String(probe.programMs)} | ${lastLine.replaceAll('|', '\\|').slice(0, 120)} |`,
  );
}

function readLines(file: string): Line[] {
  return readFileSync(join('results', `${file}.jsonl`), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((text): unknown => JSON.parse(text))
    .filter((line): line is Line => typeof line === 'object' && line !== null);
}

function collectNumbers(lines: Line[], key: string): number[] {
  return lines.map((line) => line[key]).filter((value): value is number => typeof value === 'number');
}

function pickPercentile(values: number[], fraction: number): number {
  const sorted = values.toSorted((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(fraction * sorted.length) - 1)] ?? Number.NaN;
}
