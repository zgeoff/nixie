// Prints each long-hold trial as one table row, for the logs given.
// Usage: bun report-holds.ts results/holds-gpt-*.jsonl
import { z } from 'zod';
import { collectHoldTrial } from './collect-hold-trial.ts';

const logLine = z.object({
  connection: z.string(),
  event: z.record(z.string(), z.unknown()),
  receivedAtMs: z.number(),
});

console.log(
  '| Hold | Line | Set | Delegated | Said before line | Line accepted | Said in hold | Answer accepted | New words | Said after answer | Errors |',
);
console.log('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
for (const path of process.argv.slice(2)) {
  const entries = (await Bun.file(path).text())
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => logLine.parse(JSON.parse(line)));
  const trial = collectHoldTrial(entries);
  const hold = trial.saidInHold.map((utterance) => `+${utterance.afterLineMs} ms "${utterance.text}"`).join('; ');
  console.log(
    `| ${trial.holdMs / 1000} s | ${trial.line ?? 'none'} | ${trial.answerSet} | ${trial.delegated} | "${trial.saidBeforeLine}" | ${trial.lineAccepted} | ${hold} | ${trial.answerAccepted} | ${trial.newWords.join(' ')} | "${trial.saidAfterAnswer}" | ${trial.errors.join('; ')} |`,
  );
}
