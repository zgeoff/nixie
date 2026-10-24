// Prints the turn-taking runs as one table per candidate and speech set.
// Usage: report-turn-taking.ts <file.jsonl>...
import { parseArgs } from 'node:util';
import { formatTurnTakingReport } from './format-turn-taking-report.ts';
import { turnTakingRecord } from './turn-taking-record.ts';

const { positionals: files } = parseArgs({ allowPositionals: true, options: {} });
const records = (
  await Promise.all(files.map(async (file) => (await Bun.file(file).text()).split('\n').filter(Boolean)))
)
  .flat()
  .map((line) => turnTakingRecord.parse(JSON.parse(line)));
console.log(formatTurnTakingReport(records));
