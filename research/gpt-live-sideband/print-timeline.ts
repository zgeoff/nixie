// Prints a probe log as a readable timeline: runs of transcript deltas joined into one line each,
// spans of reflected output audio louder than silence, and every other event in full.
// Usage: bun print-timeline.ts results/<label>.jsonl
import { z } from 'zod';
import { collectTimeline } from './collect-timeline.ts';

const logLine = z.object({
  connection: z.string(),
  event: z.record(z.string(), z.unknown()),
  receivedAtMs: z.number(),
});

const path = z.string().parse(process.argv[2]);
const entries = (await Bun.file(path).text())
  .split('\n')
  .filter((line) => line !== '')
  .map((line) => logLine.parse(JSON.parse(line)));
for (const line of collectTimeline(entries)) {
  console.log(line);
}
