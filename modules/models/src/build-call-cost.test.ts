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

test('it prices a response with no cache counts from its input and output alone', () => {
  const cost = buildCallCost(
    { input_tokens: 4000, output_tokens: 600 },
    { input: 5, cacheWrite: 6.25, cacheWrite1h: 10, cachedInput: 0.5, output: 25 },
  );

  expect(cost).toBeCloseTo(0.035, 10);
});
