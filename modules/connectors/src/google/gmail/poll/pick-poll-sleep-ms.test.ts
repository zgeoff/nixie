import { expect, test } from 'bun:test';
import { pickPollSleepMs } from './pick-poll-sleep-ms';

test.each([
  ['no connection', [], 120_000],
  ['a connection due in 30 s', [30_000], 30_000],
  ['a connection due now', [0], 1000],
  ['a connection due past the interval', [3_600_000], 120_000],
  ['the earliest of 2', [90_000, 45_000], 45_000],
])('#pickPollSleepMs sleeps for %s', (_name, dueAts, expected) => {
  expect(pickPollSleepMs({ nowMs: 0, pollIntervalMs: 120_000, dueAts })).toBe(expected);
});
