import { expect, test } from 'bun:test';
import { formatBargeInReport } from './format-barge-in-report.ts';

test('it reports the stop times, the replies that never stopped and the failed runs per candidate', () => {
  const report = formatBargeInReport([
    {
      candidate: 'grok',
      interrupted: true,
      recording: 'r0.wav',
      round: 0,
      said: 'Bread began when people',
      spokeAfterStop: true,
      stopMs: 400,
    },
    {
      candidate: 'grok',
      interrupted: true,
      recording: 'r1.wav',
      round: 1,
      said: 'Long ago, grain was',
      spokeAfterStop: false,
      stopMs: 900,
    },
    {
      candidate: 'grok',
      interrupted: true,
      recording: 'r2.wav',
      round: 2,
      said: 'The first bread was flat',
      spokeAfterStop: false,
      stopMs: 600,
    },
    {
      candidate: 'gpt-live',
      interrupted: true,
      recording: 'r0.wav',
      round: 0,
      said: 'People first baked',
      spokeAfterStop: false,
    },
    {
      candidate: 'gpt-live',
      error: 'gpt-live: the socket failed',
      interrupted: false,
      recording: 'r1.wav',
      round: 1,
      said: '',
      spokeAfterStop: false,
    },
  ]);

  expect(report).toMatchInlineSnapshot(`
    "| Candidate | Runs | Reply went on after the interruption, median / longest | Never stopped | Spoke again after stopping | Failed |
    | --- | --- | --- | --- | --- | --- |
    | grok | 3 | 600 / 900 ms | 0 | 1 of 3 | 0 |
    | gpt-live | 2 | - | 1 | 0 of 1 | 1 |"
  `);
});
