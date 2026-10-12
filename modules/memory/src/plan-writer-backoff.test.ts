import { expect, test } from 'bun:test';
import { planWriterBackoff } from './plan-writer-backoff';

test.each([
  [0, 30_000],
  [1, 30_000],
  [2, 60_000],
  [3, 120_000],
  [7, 1_920_000],
  [8, 3_600_000],
  [40, 3_600_000],
])('it waits after %d failures for %d milliseconds', (failures, expected) => {
  expect(planWriterBackoff(failures, 30_000, 3_600_000)).toBe(expected);
});
