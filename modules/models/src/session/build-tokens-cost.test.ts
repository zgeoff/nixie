import { expect, test } from 'bun:test';
import { buildTokensCost } from './build-tokens-cost';

test('#buildTokensCost prices a cache write at the longer lifetime and a missing count as nothing', () => {
  const cost = buildTokensCost(
    { inputTokens: 1_000_000, cacheWriteTokens: 1_000_000, cacheReadTokens: 1_000_000 },
    { input: 3, cacheWrite: 3.75, cacheWrite1h: 6, cachedInput: 0.3, output: 15 },
  );

  expect(cost).toBeCloseTo(3 + 6 + 0.3, 10);
});

test.each([
  { input: 3, dollars: 3 },
  { input: 6, dollars: 6 },
])('#buildTokensCost prices a million input tokens at $input dollars', (row) => {
  const cost = buildTokensCost(
    { inputTokens: 1_000_000 },
    { input: row.input, cacheWrite: 3.75, cacheWrite1h: 6, cachedInput: 0.3, output: 15 },
  );

  expect(cost).toBe(row.dollars);
});
