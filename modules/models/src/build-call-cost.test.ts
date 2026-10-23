import { expect, test } from 'bun:test';
import { buildCallCost } from './build-call-cost';

test('it prices the 1-hour cache writes of a mixed response at the 1-hour price and the rest at the 5-minute price', () => {
  const cost = buildCallCost(
    {
      input_tokens: 10,
      output_tokens: 200,
      cache_creation_input_tokens: 3000,
      cache_read_input_tokens: 50_000,
      cache_creation: { ephemeral_5m_input_tokens: 1000, ephemeral_1h_input_tokens: 2000 },
    },
    { input: 5, cacheWrite: 6.25, cacheWrite1h: 10, cachedInput: 0.5, output: 25 },
  );

  expect(cost).toBeCloseTo(0.0563, 10);
});

test('it prices every cache write at the 5-minute price when the response writes no 1-hour entry', () => {
  const cost = buildCallCost(
    {
      input_tokens: 10,
      output_tokens: 200,
      cache_creation_input_tokens: 3000,
      cache_read_input_tokens: 50_000,
      cache_creation: { ephemeral_5m_input_tokens: 3000, ephemeral_1h_input_tokens: 0 },
    },
    { input: 5, cacheWrite: 6.25, cacheWrite1h: 10, cachedInput: 0.5, output: 25 },
  );

  expect(cost).toBeCloseTo(0.0488, 10);
});

test('it prices every cache write at the 1-hour price when the response leaves out the split by lifetime', () => {
  const cost = buildCallCost(
    {
      input_tokens: 10,
      output_tokens: 200,
      cache_creation_input_tokens: 3000,
      cache_read_input_tokens: 50_000,
    },
    { input: 5, cacheWrite: 6.25, cacheWrite1h: 10, cachedInput: 0.5, output: 25 },
  );

  expect(cost).toBeCloseTo(0.06005, 10);
});

test('it prices the cache writes the split leaves unreported at the 1-hour price', () => {
  const cost = buildCallCost(
    {
      input_tokens: 0,
      output_tokens: 0,
      cache_creation_input_tokens: 3000,
      cache_creation: { ephemeral_5m_input_tokens: 1000 },
    },
    { input: 5, cacheWrite: 6.25, cacheWrite1h: 10, cachedInput: 0.5, output: 25 },
  );

  expect(cost).toBeCloseTo(0.02625, 10);
});

test('it counts the split in full when it reports more cache writes than the total', () => {
  const cost = buildCallCost(
    {
      input_tokens: 0,
      output_tokens: 0,
      cache_creation_input_tokens: 1000,
      cache_creation: { ephemeral_5m_input_tokens: 1000, ephemeral_1h_input_tokens: 2000 },
    },
    { input: 5, cacheWrite: 6.25, cacheWrite1h: 10, cachedInput: 0.5, output: 25 },
  );

  expect(cost).toBeCloseTo(0.02625, 10);
});

test.each([
  ['a 100,000-token prompt of input at the base rate', { input_tokens: 100_000 }, 0.01],
  ['a 100,001-token prompt of input at the long-prompt rate', { input_tokens: 100_001 }, 0.0500005],
  [
    'a 100,000-token prompt of 5-minute cache writes at the base rate',
    {
      cache_creation_input_tokens: 100_000,
      cache_creation: { ephemeral_5m_input_tokens: 100_000, ephemeral_1h_input_tokens: 0 },
    },
    0.0125,
  ],
  [
    'a 100,001-token prompt of 5-minute cache writes at the long-prompt rate',
    {
      cache_creation_input_tokens: 100_001,
      cache_creation: { ephemeral_5m_input_tokens: 100_001, ephemeral_1h_input_tokens: 0 },
    },
    0.062500625,
  ],
  [
    'a 100,000-token prompt of 1-hour cache writes at the base rate',
    {
      cache_creation_input_tokens: 100_000,
      cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 100_000 },
    },
    0.02,
  ],
  [
    'a 100,001-token prompt of 1-hour cache writes at the long-prompt rate',
    {
      cache_creation_input_tokens: 100_001,
      cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 100_001 },
    },
    0.100001,
  ],
  [
    'a 100,000-token prompt of cache reads at the base rate',
    { cache_read_input_tokens: 100_000 },
    0.001,
  ],
  [
    'a 100,001-token prompt of cache reads at the long-prompt rate',
    { cache_read_input_tokens: 100_001 },
    0.00500005,
  ],
  [
    'the output of a 100,000-token prompt at the base rate',
    { input_tokens: 100_000, output_tokens: 1000 },
    0.0105,
  ],
  [
    'the output of a 100,001-token prompt at the long-prompt rate',
    { input_tokens: 100_001, output_tokens: 1000 },
    0.0525005,
  ],
])('it prices %s', (_label, usage, expected) => {
  const cost = buildCallCost(
    { input_tokens: 0, output_tokens: 0, ...usage },
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
      input_tokens: 40_000,
      output_tokens: 0,
      cache_creation_input_tokens: 20_001,
      cache_read_input_tokens: 40_000,
      cache_creation: { ephemeral_5m_input_tokens: 20_001, ephemeral_1h_input_tokens: 0 },
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
    { input_tokens: 200_000, output_tokens: 1000 },
    { input: 0.1, cacheWrite: 0.125, cacheWrite1h: 0.2, cachedInput: 0.01, output: 0.5 },
  );

  expect(cost).toBeCloseTo(0.0205, 12);
});

test('it prices a response with no cache counts from its input and output alone', () => {
  const cost = buildCallCost(
    { input_tokens: 4000, output_tokens: 600 },
    { input: 5, cacheWrite: 6.25, cacheWrite1h: 10, cachedInput: 0.5, output: 25 },
  );

  expect(cost).toBeCloseTo(0.035, 10);
});
