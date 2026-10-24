// Prints the barge-in runs as one table per candidate.
// Usage: report-barge-in.ts <file.jsonl>...
import { parseArgs } from 'node:util';
import { bargeInRecord } from './barge-in-record.ts';
import { formatBargeInReport } from './format-barge-in-report.ts';

const { positionals: files } = parseArgs({ allowPositionals: true, options: {} });
const records = (
  await Promise.all(files.map(async (file) => (await Bun.file(file).text()).split('\n').filter(Boolean)))
)
  .flat()
  .map((line) => bargeInRecord.parse(JSON.parse(line)));
console.log(formatBargeInReport(records));
