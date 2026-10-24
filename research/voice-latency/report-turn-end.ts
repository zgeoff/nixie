// Replays each end-of-turn candidate over the pauses that turn-end.ts recorded, and prints per
// candidate and speech set the share of utterances cut off and the wait after the last speech of
// those heard whole, then each detector's answer time.
// Usage: report-turn-end.ts <file.jsonl>... [--min-wait 200] [--max-wait 1200] [--silence 500]
import { z } from 'zod';
import { defaultTurnEndSettings, findTurnEnd } from './find-turn-end.ts';
import type { DetectorName } from './find-turn-end.ts';

const settings = {
  maxWaitMs: Number(readFlag('--max-wait') ?? defaultTurnEndSettings.maxWaitMs),
  minWaitMs: Number(readFlag('--min-wait') ?? defaultTurnEndSettings.minWaitMs),
  silenceMs: Number(readFlag('--silence') ?? defaultTurnEndSettings.silenceMs),
};
const files = process.argv.slice(2).filter((arg, index, args) => !arg.startsWith('--') && !args[index - 1]?.startsWith('--'));

function readFlag(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

const detectorName = z.enum(['smartTurn', 'clef', 'jev']);
const answer = z.union([z.object({ answeredAfterMs: z.number(), probability: z.number() }), z.object({ error: z.string() })]);
const record = z.object({
  detectors: z.array(detectorName),
  durationMs: z.number(),
  pauses: z.array(
    z.object({
      answers: z.partialRecord(detectorName, answer),
      resumeMs: z.number().optional(),
      speechEndMs: z.number(),
    }),
  ),
  set: z.string(),
});

const records = (
  await Promise.all(files.map(async (file) => (await Bun.file(file).text()).split('\n').filter(Boolean)))
)
  .flat()
  .map((line) => record.parse(JSON.parse(line)));
const sets = [...new Set(records.map((entry) => entry.set))];
const candidates: { detectors: DetectorName[]; name: string }[] = [
  { detectors: [], name: `Silence, ${settings.silenceMs} ms` },
  { detectors: ['smartTurn'], name: 'Smart Turn v3.2' },
  { detectors: ['clef'], name: 'Clef-flash' },
  { detectors: ['jev'], name: 'Jev' },
  { detectors: ['smartTurn', 'clef'], name: 'Smart Turn and Clef-flash' },
  { detectors: ['smartTurn', 'jev'], name: 'Smart Turn and Jev' },
];

console.log(`Waits from ${settings.minWaitMs} ms when sure to ${settings.maxWaitMs} ms when unsure.\n`);
console.log('| Candidate | Speech | Utterances | Cut off | Wait after the end, median / p90 | Failed |');
console.log('| --- | --- | --- | --- | --- | --- |');
for (const candidate of candidates) {
  for (const set of sets) {
    const results = records
      .filter((entry) => entry.set === set && candidate.detectors.every((detector) => entry.detectors.includes(detector)))
      .flatMap((entry) => findTurnEnd(entry.pauses, candidate.detectors, settings, entry.durationMs) ?? []);
    if (results.length === 0) {
      continue;
    }
    const ended = results.flatMap((result) => ('error' in result ? [] : [result]));
    const cutOff = ended.filter((result) => result.cutOff).length;
    const waits = ended.filter((result) => !result.cutOff).map((result) => result.waitMs);
    console.log(
      `| ${candidate.name} | ${set} | ${ended.length} | ${cutOff} (${((cutOff / ended.length) * 100).toFixed(1)}%) | ${formatPercentiles(waits)} | ${results.length - ended.length} |`,
    );
  }
}

console.log('\n| Detector | Speech | Pauses | Answer after the end of speech, median / p90 |');
console.log('| --- | --- | --- | --- |');
for (const detector of detectorName.options) {
  for (const set of sets) {
    const times = records
      .filter((entry) => entry.set === set)
      .flatMap((entry) => entry.pauses.map((pause) => pause.answers[detector]))
      .flatMap((entry) => (entry !== undefined && 'answeredAfterMs' in entry ? [entry.answeredAfterMs] : []));
    if (times.length > 0) {
      console.log(`| ${detector} | ${set} | ${times.length} | ${formatPercentiles(times)} |`);
    }
  }
}

function formatPercentiles(values: number[]): string {
  if (values.length === 0) {
    return '-';
  }
  const sorted = values.toSorted((first, second) => first - second);
  const at = (share: number): number => Math.round(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))] ?? 0);
  return `${at(0.5)} / ${at(0.9)}`;
}
