import { expect, test } from 'bun:test';
import { planBackoffDelay } from './plan-backoff-delay';

test.each([
  [0, 30_000],
  [1, 30_000],
  [2, 60_000],
  [3, 120_000],
  [7, 1_920_000],
  [8, 3_600_000],
  [40, 3_600_000],
])('it waits after %d failures for %d milliseconds', (failures, expected) => {
  expect(planBackoffDelay(failures, { firstMs: 30_000, maxMs: 3_600_000 })).toBe(expected);
});

test.each([
  [1, 30_000],
  [2, 60_000],
  [3, 120_000],
  [4, 240_000],
])('it waits after error %d for %d ms', (errors, expected) => {
  expect(planBackoffDelay(errors, { firstMs: 30_000, maxMs: 300_000 })).toBe(expected);
});

test('it stops the delay growing at the maximum', () => {
  expect(
    [5, 6, 20, 1000].map((errors) => planBackoffDelay(errors, { firstMs: 30_000, maxMs: 300_000 })),
  ).toStrictEqual([300_000, 300_000, 300_000, 300_000]);
});

test('it multiplies the wait by the factor', () => {
  expect(
    [1, 2, 3, 4, 5].map((failures) =>
      planBackoffDelay(failures, { firstMs: 30_000, maxMs: 1_800_000, factor: 4 }),
    ),
  ).toStrictEqual([30_000, 120_000, 480_000, 1_800_000, 1_800_000]);
});

test('it keeps the maximum when the first wait already passes it', () => {
  expect(planBackoffDelay(1, { firstMs: 60_000, maxMs: 30_000 })).toBe(30_000);
});

test('it keeps the maximum after more failures than a number can count the growth of', () => {
  expect(planBackoffDelay(5000, { firstMs: 1000, maxMs: 30_000 })).toBe(30_000);
});

test('it keeps a zero first wait at zero however many failures pass', () => {
  expect(planBackoffDelay(5000, { firstMs: 0, maxMs: 30_000 })).toBe(0);
});
