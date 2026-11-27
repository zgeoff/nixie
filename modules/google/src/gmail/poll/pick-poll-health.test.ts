import { expect, test } from 'bun:test';
import { pickPollHealth } from './pick-poll-health';

test.each<[string, number[], 'running' | 'unhealthy' | null]>([
  ['3 failures of one connection', [0, 3], 'unhealthy'],
  ['more than 3 failures', [5], 'unhealthy'],
  ['no failure', [0, 0], 'running'],
  ['no connection', [], 'running'],
  ['2 failures, which leave the last report standing', [2, 0], null],
])('#pickPollHealth answers for %s', (_name, failures, expected) => {
  expect(pickPollHealth(failures)).toBe(expected);
});
