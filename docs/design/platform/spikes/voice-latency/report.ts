// Prints the median and the 90th percentile, in ms, of each timing from the stage and call runs,
// as Markdown tables.
// Usage: report.ts results/stages.jsonl results/calls.jsonl [more call files...]
import { readFileSync } from 'node:fs';
import { isFailedTurn } from './is-failed-turn.ts';

type Row = Record<string, unknown>;

const gateMs = 2500,
  [stagesPath, ...callPaths] = process.argv.slice(2);

function loadRows(path: string | undefined): Row[] {
  return path
    ? readFileSync(path, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line) as Row)
    : [];
}

function getQuantile(sorted: number[], q: number): number {
  const index = Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1);
  return sorted[Math.max(0, index)] ?? Number.NaN;
}

function collectNumbers(rows: Row[], field: string): number[] {
  return rows
    .map((row) => row[field])
    .filter((value): value is number => typeof value === 'number')
    .toSorted((a, b) => a - b);
}

function formatStats(rows: Row[], field: string, digits = 0): string {
  const values = collectNumbers(rows, field);
  return values.length === 0
    ? '-'
    : `${getQuantile(values, 0.5).toFixed(digits)} / ${getQuantile(values, 0.9).toFixed(digits)}`;
}

function renderTable(header: string[], body: string[][]): string {
  return [
    `| ${header.join(' | ')} |`,
    `| ${header.map(() => '---').join(' | ')} |`,
    ...body.map((cells) => `| ${cells.join(' | ')} |`),
  ].join('\n');
}

function splitBy(rows: Row[], key: (row: Row) => string): Map<string, Row[]> {
  const groups = new Map<string, Row[]>();
  for (const row of rows) {
    groups.set(key(row), [...(groups.get(key(row)) ?? []), row]);
  }
  return groups;
}

const stages = loadRows(stagesPath),
  calls = callPaths.flatMap((path) => loadRows(path));

const sttRows = [...splitBy(
  stages.filter((row) => row.stage === 'stt'),
  (row) => `${String(row.stt)}, ${String(row.silenceMs)} ms pause`,
)].map(([name, rows]) => {
  const errors = collectNumbers(rows, 'wordErrors').reduce((a, b) => a + b, 0),
    words = collectNumbers(rows, 'words').reduce((a, b) => a + b, 0);
  return [
    name,
    String(rows.length),
    formatStats(rows, 'endpointMs'),
    formatStats(rows, 'sttMs'),
    `${((errors / words) * 100).toFixed(1)}%`,
  ];
});
console.log('### Speech-to-text on its own\n');
console.log(
  renderTable(['Model', 'Lines', 'End of speech to VAD end', 'VAD end to transcript', 'Word errors'], sttRows),
);

const ttsRows = [...splitBy(
  stages.filter((row) => row.stage === 'tts'),
  (row) => String(row.tts),
)].map(([name, rows]) => [
  name,
  String(rows.length),
  formatStats(rows.filter((row) => Number(row.line) < 2), 'totalMs'),
  formatStats(rows.filter((row) => Number(row.line) >= 2), 'totalMs'),
  formatStats(rows, 'rtf', 2),
]);
console.log('\n### Text-to-speech on its own\n');
console.log(
  renderTable(['Voice', 'Sentences', 'Acknowledgement', 'Answer sentence', 'Real-time factor'], ttsRows),
);

// A failed turn produced no reply to time, so the timing tables leave it out and the last line
// counts it.
const turns = calls.filter((row) => row.kind === 'turn' && !isFailedTurn(row)),
  cellOf = (row: Row): string => `${String(row.stt)} + ${String(row.tts)}`,
  cells = splitBy(turns, cellOf);
console.log('\n### End to end, from the end of speech\n');
console.log(
  renderTable(
    ['Cell', 'Turns', 'Prompt sent', 'First text', 'First audio', 'Full text', 'Full audio', 'Meets 2.5 s'],
    [...cells].map(([name, rows]) => {
      const full = collectNumbers(rows, 'fullAudioMs');
      return [
        name,
        String(rows.length),
        formatStats(rows, 'promptMs'),
        formatStats(rows, 'firstTextMs'),
        formatStats(rows, 'firstAudioMs'),
        formatStats(rows, 'fullTextMs'),
        formatStats(rows, 'fullAudioMs'),
        // A cell with no audio, such as the control, cannot meet or miss the gate.
        full.length === 0 ? '-' : getQuantile(full, 0.5) <= gateMs ? 'yes' : 'no',
      ];
    }),
  ),
);

console.log('\n### The turn inside the pipeline\n');
console.log(
  renderTable(
    ['Cell', 'Prompt to request', 'Request to first event', 'Turns with a gap', 'Gap length', 'Acknowledgement words'],
    [...cells].map(([name, rows]) => [
      name,
      formatStats(rows, 'requestMs'),
      formatStats(rows, 'ttftStreamMs'),
      collectNumbers(rows, 'gaps').length === 0
        ? '-'
        : `${collectNumbers(rows, 'gaps').filter((gaps) => gaps > 0).length} of ${rows.length} turns`,
      formatStats(rows.filter((row) => Number(row.gaps) > 0), 'gapMs'),
      formatStats(rows, 'ackWords'),
    ]),
  ),
);

const barges = calls.filter((row) => row.kind === 'barge-in');
console.log('\n### Barge-in\n');
console.log(
  renderTable(
    ['Cell', 'Barge-in after', 'Trials', 'Speech to detection', 'Model still writing', 'Interrupt to result'],
    [...splitBy(barges, (row) => `${cellOf(row)}@${String(row.bargeInAfterMs ?? 1500)}`)].map(([key, rows]) => [
      ...key.split('@'),
      String(rows.length),
      formatStats(rows, 'detectMs'),
      String(rows.filter((row) => row.wasWriting === true).length),
      formatStats(rows, 'interruptToResultMs'),
    ]),
  ),
);

const cost = collectNumbers(calls, 'costUSD').reduce((a, b) => a + b, 0),
  // An interrupted turn ends without success by design, so only whole turns count as failures.
  failed = calls.filter((row) => row.kind !== 'barge-in' && isFailedTurn(row)).length;
console.log(`\nModel cost: $${cost.toFixed(4)} over ${calls.length} turns; ${failed} turns did not end in success.`);
