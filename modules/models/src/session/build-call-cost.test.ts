import { expect, test } from 'bun:test';
import { buildCallCost } from './build-call-cost';

test('it prices the 1-hour cache writes of a mixed call at the 1-hour price and the rest at the 5-minute price', () => {
  const cost = buildCallCost(
    {
      uncachedInputTokens: 10,
      cacheReadTokens: 50_000,
      cacheWrite5mTokens: 1000,
      cacheWrite1hTokens: 2000,
      outputTokens: 200,
    },
    { input: 5, cacheWrite: 6.25, cacheWrite1h: 10, cachedInput: 0.5, output: 25 },
  );

  expect(cost).toBeCloseTo(0.0563, 10);
});

test('it prices every cache write at the 5-minute price when the call writes no 1-hour entry', () => {
  const cost = buildCallCost(
    {
      uncachedInputTokens: 10,
      cacheReadTokens: 50_000,
      cacheWrite5mTokens: 3000,
      cacheWrite1hTokens: 0,
      outputTokens: 200,
    },
    { input: 5, cacheWrite: 6.25, cacheWrite1h: 10, cachedInput: 0.5, output: 25 },
  );

  expect(cost).toBeCloseTo(0.0488, 10);
});

test('it prices reasoning tokens once, as the part of the output they are', () => {
  const cost = buildCallCost(
    {
      uncachedInputTokens: 4000,
      cacheReadTokens: 0,
      cacheWrite5mTokens: 0,
      cacheWrite1hTokens: 0,
      outputTokens: 600,
      reasoningTokens: 400,
    },
    { input: 5, cacheWrite: 6.25, cacheWrite1h: 10, cachedInput: 0.5, output: 25 },
  );

  expect(cost).toBeCloseTo(0.035, 10);
});

test.each([
  ['a 100,000-token prompt of input at the base rate', { uncachedInputTokens: 100_000 }, 0.01],
  [
    'a 100,001-token prompt of input at the long-prompt rate',
    { uncachedInputTokens: 100_001 },
    0.0500005,
  ],
  [
    'a 100,000-token prompt of 5-minute cache writes at the base rate',
    { cacheWrite5mTokens: 100_000 },
    0.0125,
  ],
  [
    'a 100,001-token prompt of 5-minute cache writes at the long-prompt rate',
    { cacheWrite5mTokens: 100_001 },
    0.062500625,
  ],
  [
    'a 100,000-token prompt of 1-hour cache writes at the base rate',
    { cacheWrite1hTokens: 100_000 },
    0.02,
  ],
  [
    'a 100,001-token prompt of 1-hour cache writes at the long-prompt rate',
    { cacheWrite1hTokens: 100_001 },
    0.100001,
  ],
  ['a 100,000-token prompt of cache reads at the base rate', { cacheReadTokens: 100_000 }, 0.001],
  [
    'a 100,001-token prompt of cache reads at the long-prompt rate',
    { cacheReadTokens: 100_001 },
    0.00500005,
  ],
  [
    'the output of a 100,000-token prompt at the base rate',
    { uncachedInputTokens: 100_000, outputTokens: 1000 },
    0.0105,
  ],
  [
    'the output of a 100,001-token prompt at the long-prompt rate',
    { uncachedInputTokens: 100_001, outputTokens: 1000 },
    0.0525005,
  ],
])('it prices %s', (_label, usage, expected) => {
  const cost = buildCallCost(
    {
      uncachedInputTokens: 0,
      cacheReadTokens: 0,
      cacheWrite5mTokens: 0,
      cacheWrite1hTokens: 0,
      outputTokens: 0,
      ...usage,
    },
    {
      input: 0.1,
      cacheWrite: 0.125,
      cacheWrite1h: 0.2,
      cachedInput: 0.01,
      output: 0.5,
      longPrompt: {
        overTokens: 100_000,
        input: 0.5,
        cacheWrite: 0.625,
        cacheWrite1h: 1,
        cachedInput: 0.05,
        output: 2.5,
      },
    },
  );

  expect(cost).toBeCloseTo(expected, 12);
});

test('it counts the cache reads and cache writes toward the prompt length that picks the rates', () => {
  const cost = buildCallCost(
    {
      uncachedInputTokens: 40_000,
      cacheReadTokens: 40_000,
      cacheWrite5mTokens: 20_001,
      cacheWrite1hTokens: 0,
      outputTokens: 0,
    },
    {
      input: 0.1,
      cacheWrite: 0.125,
      cacheWrite1h: 0.2,
      cachedInput: 0.01,
      output: 0.5,
      longPrompt: {
        overTokens: 100_000,
        input: 0.5,
        cacheWrite: 0.625,
        cacheWrite1h: 1,
        cachedInput: 0.05,
        output: 2.5,
      },
    },
  );

  expect(cost).toBeCloseTo(0.034500625, 12);
});

test('it prices a long prompt at the base rates when the table holds no long-prompt rates', () => {
  const cost = buildCallCost(
    {
      uncachedInputTokens: 200_000,
      cacheReadTokens: 0,
      cacheWrite5mTokens: 0,
      cacheWrite1hTokens: 0,
      outputTokens: 1000,
    },
    { input: 0.1, cacheWrite: 0.125, cacheWrite1h: 0.2, cachedInput: 0.01, output: 0.5 },
  );

  expect(cost).toBeCloseTo(0.0205, 12);
});
