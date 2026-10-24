import { expect, test } from 'bun:test';
import { formatTurnTakingReport } from './format-turn-taking-report.ts';

test('it reports cut-offs, waits, silent turns and failures per candidate and speech set', () => {
  const report = formatTurnTakingReport([
    {
      candidate: 'grok',
      durationMs: 4000,
      firstSoundMs: 3000,
      id: 'hvb-1',
      index: 0,
      lastSpeechMs: 3500,
      recording: 'hvb-0.wav',
      said: 'Sure, what',
      set: 'hvb',
    },
    {
      candidate: 'grok',
      durationMs: 4000,
      firstSoundMs: 4300,
      id: 'hvb-2',
      index: 1,
      lastSpeechMs: 3500,
      recording: 'hvb-1.wav',
      said: 'Your balance is',
      set: 'hvb',
    },
    {
      candidate: 'grok',
      durationMs: 3000,
      firstSoundMs: 3900,
      id: 'hvb-3',
      index: 2,
      lastSpeechMs: 2500,
      recording: 'hvb-2.wav',
      said: 'Okay, I can',
      set: 'hvb',
    },
    {
      candidate: 'grok',
      durationMs: 3000,
      id: 'hvb-4',
      index: 3,
      lastSpeechMs: 2500,
      recording: 'hvb-3.wav',
      said: '',
      set: 'hvb',
    },
    {
      candidate: 'grok',
      durationMs: 3000,
      error: 'grok: the socket failed',
      id: 'hvb-5',
      index: 4,
      lastSpeechMs: 2500,
      recording: 'hvb-4.wav',
      said: '',
      set: 'hvb',
    },
    {
      candidate: 'gpt-live',
      durationMs: 2000,
      firstSoundMs: 2600,
      id: 'slurp-1',
      index: 0,
      lastSpeechMs: 1800,
      recording: 'slurp-0.wav',
      said: 'Done.',
      set: 'slurp',
    },
  ]);

  expect(report).toMatchInlineSnapshot(`
    "| Candidate | Speech | Utterances | Spoke before the last speech ended | Wait after the last speech, median / p90 | Never replied | Failed |
    | --- | --- | --- | --- | --- | --- | --- |
    | grok | hvb | 5 | 1 (25.0%) | 1400 / 1400 ms | 1 | 1 |
    | gpt-live | slurp | 1 | 0 (0.0%) | 800 / 800 ms | 0 | 0 |"
  `);
});
