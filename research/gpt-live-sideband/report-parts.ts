// Prints each sentence-parts trial as one table row, for the logs given.
// Usage: bun report-parts.ts results/parts-*.jsonl
import { z } from 'zod';
import { collectPartsTrial } from './collect-parts-trial.ts';

const logLine = z.object({
  connection: z.string(),
  event: z.record(z.string(), z.unknown()),
  receivedAtMs: z.number(),
});

console.log(
  '| Shape | Set | Gap | Delegated | Said before part 1 | First audio | Last part after first audio | Longest pause | Quiet when later parts arrived | New words before last part | New words | Spoken |',
);
console.log('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
for (const path of process.argv.slice(2)) {
  const entries = (await Bun.file(path).text())
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => logLine.parse(JSON.parse(line)));
  const trial = collectPartsTrial(entries);
  console.log(
    `| ${trial.shape} | ${trial.answerSet} | ${trial.gapMs} ms | ${trial.delegated} | "${trial.spokenBeforeFirstPart}" | ${trial.firstAudioAfterMs ?? '?'} ms | ${trial.lastPartAfterFirstAudioMs ?? '?'} ms | ${trial.longestPauseMs} ms | ${trial.silentBeforePartsMs.map((silenceMs) => (silenceMs === null ? 'not yet speaking' : `${silenceMs} ms`)).join(', ')} | ${trial.newWordsBeforeLastPart.join(' ')} | ${trial.newWords.join(' ')} | "${trial.spoken}" |`,
  );
}
