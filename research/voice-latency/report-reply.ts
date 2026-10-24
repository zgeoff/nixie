// Prints the reply runs as one table per candidate: first audio, full answer audio, gaps, tool calls
// and cost, against the spike's pass criteria.
// Usage: report-reply.ts <file.jsonl>...
import { parseArgs } from 'node:util';
import { formatReplyReport } from './format-reply-report.ts';
import { replyRecord } from './reply-record.ts';

const { positionals: files } = parseArgs({ allowPositionals: true, options: {} });
const records = (
  await Promise.all(files.map(async (file) => (await Bun.file(file).text()).split('\n').filter(Boolean)))
)
  .flat()
  .map((line) => replyRecord.parse(JSON.parse(line)));
console.log(formatReplyReport(records));
