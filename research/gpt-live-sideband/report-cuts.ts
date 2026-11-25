// Prints each talk-over trial of a cut probe as one table row.
// Usage: bun report-cuts.ts results/cut-<label>.jsonl
import { z } from 'zod';
import { collectCutTrials } from './collect-cut-trials.ts';

const logLine = z.object({
  connection: z.string(),
  event: z.record(z.string(), z.unknown()),
  receivedAtMs: z.number(),
});
const playbackLevel = z.object({ atMs: z.number(), peak: z.number() });

const path = z.string().parse(process.argv[2]);
const entries = (await Bun.file(path).text())
  .split('\n')
  .filter((line) => line !== '')
  .map((line) => logLine.parse(JSON.parse(line)));
const playback = z.array(playbackLevel).parse(await Bun.file(path.replace('.jsonl', '.playback.json')).json());
console.log('| Trial | Cut at | Output audio ends | Event naming the cut | Spoken before the cut | heardChars / sent | Speaker quiet after |');
console.log('| --- | --- | --- | --- | --- | --- | --- |');
for (const trial of collectCutTrials(entries, playback)) {
  console.log(
    `| ${trial.trial + 1} | ${trial.cutAtMs} ms | ${trial.lastOutputAudioEndMs} ms | ${trial.cutEvent ?? 'none'} | "${trial.spokenBeforeCut.trim()}" | ${trial.heardChars} / ${trial.sentChars} | ${trial.playbackStopAfterMs ?? '?'} ms |`,
  );
}
