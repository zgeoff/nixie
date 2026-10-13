import { expect, test } from 'bun:test';
import { priceUsage } from './price-usage.ts';
import { toSoloUsage } from './to-solo-usage.ts';

test('it prices the cache read of the first batch as a cache write', () => {
  const usage = { cacheRead: 1067, cacheWrite: 1000, input: 5, output: 300 };

  // 5 input tokens at $0.1, 2,067 cache writes at $0.2 and 300 output at $0.5, per million tokens.
  expect(priceUsage(toSoloUsage(usage, 0))).toBeCloseTo(0.0005639, 10);
});

test('it moves the whole cache read of the first batch to the cache write', () => {
  expect(
    toSoloUsage({ cacheRead: 1500, cacheWrite: 1000, input: 5, output: 300 }, 0),
  ).toStrictEqual({ cacheRead: 0, cacheWrite: 2500, input: 5, output: 300 });
});

test('it keeps the shared preamble as a cache read after the first batch', () => {
  expect(
    toSoloUsage({ cacheRead: 1500, cacheWrite: 1000, input: 5, output: 300 }, 1),
  ).toStrictEqual({ cacheRead: 1067, cacheWrite: 1433, input: 5, output: 300 });
});

test('it leaves a later batch that read only the shared preamble unchanged', () => {
  expect(
    toSoloUsage({ cacheRead: 1067, cacheWrite: 1000, input: 5, output: 300 }, 3),
  ).toStrictEqual({ cacheRead: 1067, cacheWrite: 1000, input: 5, output: 300 });
});
