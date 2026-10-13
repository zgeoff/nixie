import { expect, test } from 'bun:test';
import { planRetryDelay } from './plan-retry-delay';

test.each([
  [1, 30_000],
  [2, 60_000],
  [3, 120_000],
  [4, 240_000],
])('it waits after error %d for %d ms', (errors, expected) => {
  expect(planRetryDelay(errors, 30_000, 300_000)).toBe(expected);
});

test('it stops the delay growing at the maximum', () => {
  expect([5, 6, 20, 1000].map((errors) => planRetryDelay(errors, 30_000, 300_000))).toStrictEqual([
    300_000, 300_000, 300_000, 300_000,
  ]);
});
