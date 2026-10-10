// Prints the median and 90th percentile, in ms, of each timing per cell. --by picks the cell keys
// from model, tools and mode; the rows of every other key pool into the cell.
// Usage: report.ts results/<run>.jsonl [--by model,tools,mode]
import { readFileSync } from 'node:fs';

interface Row {
  error?: string;
  firstText?: number;
  firstThinking?: number;
  init?: number;
  isError?: boolean;
  mode: string;
  model: string;
  requesting?: number;
  result?: number;
  tools: number;
  ttftStreamMs?: number;
  turnIndex?: number;
}

type Key = 'mode' | 'model' | 'tools';

// requestToText is the time from the CLI's model request to the first text token.
const fields = [
    'init',
    'requesting',
    'firstThinking',
    'firstText',
    'result',
    'requestToText',
    'ttftStreamMs',
  ] as const,
  keyLabels: Record<Key, (row: Row) => string> = {
    mode: (row) => `${row.mode}#${row.turnIndex ?? 0}`,
    model: (row) => row.model,
    tools: (row) => String(row.tools),
  };

function readField(row: Row, field: (typeof fields)[number]): number | undefined {
  if (field === 'requestToText') {
    return row.firstText === undefined || row.requesting === undefined
      ? undefined
      : row.firstText - row.requesting;
  }
  return row[field];
}

function getQuantile(sorted: number[], q: number): number {
  const index = Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1);
  return sorted[Math.max(0, index)] ?? Number.NaN;
}

function formatStats(values: number[]): string {
  if (values.length === 0) {
    return '-';
  }
  const sorted = values.toSorted((a, b) => a - b);
  return `${getQuantile(sorted, 0.5).toFixed(0)} / ${getQuantile(sorted, 0.9).toFixed(0)}`;
}

// Groups rows into cells, and reports failed rows on stderr.
function collectCells(path: string, keys: Key[]): Map<string, Row[]> {
  const cells = new Map<string, Row[]>(),
    rows = readFileSync(path, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as Row);
  for (const row of rows) {
    const key = keys.map((name) => keyLabels[name](row)).join(' | ');
    if (row.error || row.isError) {
      console.error(`error ${key}: ${row.error ?? 'error result'}`);
    } else {
      cells.set(key, [...(cells.get(key) ?? []), row]);
    }
  }
  return cells;
}

function printReport(path: string, keys: Key[]): void {
  console.log(`| ${keys.join(' | ')} | n | ${fields.join(' | ')} |`);
  console.log(`| ${[...keys, 'n', ...fields].map(() => '---').join(' | ')} |`);
  for (const [key, cellRows] of collectCells(path, keys)) {
    const stats = fields.map((field) =>
      formatStats(cellRows.flatMap((row) => readField(row, field) ?? [])),
    );
    console.log(`| ${key} | ${cellRows.length} | ${stats.join(' | ')} |`);
  }
}

function readKeys(argv: string[]): Key[] {
  const index = argv.indexOf('--by');
  return (index === -1 ? 'model,tools,mode' : (argv[index + 1] ?? '')).split(',') as Key[];
}

printReport(process.argv[2] ?? '', readKeys(process.argv));
