import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function setupTest() {
  const dir = await mkdtemp(join(tmpdir(), 'report-turn-end-'));

  onTestFinished(() => rm(dir, { force: true, recursive: true }));

  return { dir };
}

test('it reports cut-offs, waits of whole turns, failures and answer times per candidate', async () => {
  const ctx = await setupTest();
  const file = join(ctx.dir, 'turn-end-hvb.jsonl');
  await writeFile(
    file,
    [
      {
        detectors: ['smartTurn', 'clef', 'jev'],
        durationMs: 2000,
        id: 'call-1',
        index: 0,
        models: { clef: 'clef-flash', jev: 'jev-1.14.0', smartTurn: 'smart-turn-v3.2-cpu' },
        pauses: [
          {
            answers: {
              clef: { answeredAfterMs: 700, probability: 1 },
              jev: { answeredAfterMs: 600, probability: 1 },
              smartTurn: { answeredAfterMs: 300, probability: 1 },
            },
            speechEndMs: 2000,
            transcript: 'what time does the branch open',
          },
        ],
        set: 'hvb',
      },
      {
        detectors: ['smartTurn', 'clef', 'jev'],
        durationMs: 1500,
        id: 'call-2',
        index: 1,
        models: { clef: 'clef-flash', jev: 'jev-1.14.0', smartTurn: 'smart-turn-v3.2-cpu' },
        pauses: [
          {
            answers: {
              clef: { answeredAfterMs: 800, probability: 0.5 },
              jev: { answeredAfterMs: 500, probability: 0.5 },
              smartTurn: { answeredAfterMs: 300, probability: 0.5 },
            },
            speechEndMs: 1500,
            transcript: 'i would like to',
          },
        ],
        set: 'hvb',
      },
      {
        detectors: ['smartTurn', 'clef', 'jev'],
        durationMs: 3000,
        id: 'call-3',
        index: 2,
        models: { clef: 'clef-flash', jev: 'jev-1.14.0', smartTurn: 'smart-turn-v3.2-cpu' },
        pauses: [
          {
            answers: {
              clef: { answeredAfterMs: 700, probability: 1 },
              jev: { answeredAfterMs: 600, probability: 1 },
              smartTurn: { answeredAfterMs: 300, probability: 1 },
            },
            resumeMs: 1800,
            speechEndMs: 1000,
            transcript: 'my card',
          },
          {
            answers: {
              clef: { answeredAfterMs: 700, probability: 1 },
              jev: { answeredAfterMs: 600, probability: 1 },
              smartTurn: { answeredAfterMs: 300, probability: 1 },
            },
            speechEndMs: 3000,
            transcript: 'my card was declined at the shop',
          },
        ],
        set: 'hvb',
      },
      {
        detectors: ['smartTurn', 'clef', 'jev'],
        durationMs: 2500,
        id: 'call-4',
        index: 3,
        models: { clef: 'clef-flash', jev: 'jev-1.14.0', smartTurn: 'smart-turn-v3.2-cpu' },
        pauses: [
          {
            answers: {
              clef: { error: 'clef: HTTP 429' },
              jev: { answeredAfterMs: 600, probability: 1 },
              smartTurn: { answeredAfterMs: 300, probability: 1 },
            },
            speechEndMs: 2500,
            transcript: 'please close my savings account',
          },
        ],
        set: 'hvb',
      },
    ]
      .map((record) => JSON.stringify(record))
      .join('\n'),
  );

  const report = Bun.spawnSync([process.execPath, 'report-turn-end.ts', file], { cwd: import.meta.dir });

  expect(report.exitCode).toBe(0);
  expect(report.stdout.toString()).toMatchInlineSnapshot(`
    "Waits from 200 ms when sure to 1200 ms when unsure.

    | Candidate | Speech | Utterances | Cut off | Wait after the end, median / p90 | Failed |
    | --- | --- | --- | --- | --- | --- |
    | Silence, 500 ms | hvb | 4 | 1 (25.0%) | 500 / 500 | 0 |
    | Smart Turn v3.2 | hvb | 4 | 1 (25.0%) | 300 / 700 | 0 |
    | Clef-flash | hvb | 3 | 1 (33.3%) | 800 / 800 | 1 |
    | Jev | hvb | 4 | 1 (25.0%) | 600 / 700 | 0 |
    | Smart Turn and Clef-flash | hvb | 3 | 1 (33.3%) | 800 / 800 | 1 |
    | Smart Turn and Jev | hvb | 4 | 1 (25.0%) | 600 / 700 | 0 |

    | Detector | Speech | Pauses | Answer after the end of speech, median / p90 |
    | --- | --- | --- | --- |
    | smartTurn | hvb | 5 | 300 / 300 |
    | clef | hvb | 4 | 700 / 800 |
    | jev | hvb | 5 | 600 / 600 |
    "
  `);
});
