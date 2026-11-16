import { expect, test } from 'bun:test';
import { buildMockTokenBreakdown } from '../test-utils/build-mock-token-breakdown';
import { findNewCall } from './find-new-call';

test('it takes the uncached input as the input less the cached and the cache write counts', () => {
  const last = buildMockTokenBreakdown({
    totalTokens: 1000,
    inputTokens: 900,
    cachedInputTokens: 600,
    cacheWriteInputTokens: 100,
    reasoningOutputTokens: 3,
  });

  expect(findNewCall(0, { total: last, last })).toStrictEqual({
    uncachedInputTokens: 200,
    cacheReadTokens: 600,
    cacheWrite5mTokens: 0,
    cacheWrite1hTokens: 100,
    outputTokens: 100,
    reasoningTokens: 3,
  });
});

test('it never gives a negative uncached input', () => {
  const last = buildMockTokenBreakdown({
    totalTokens: 100,
    inputTokens: 50,
    cachedInputTokens: 40,
    cacheWriteInputTokens: 40,
    reasoningOutputTokens: 3,
  });

  expect(findNewCall(0, { total: last, last })).toStrictEqual(
    expect.objectContaining({ uncachedInputTokens: 0 }),
  );
});

test('it gives null for a stored figure that the CLI repeats', () => {
  const last = buildMockTokenBreakdown({
    totalTokens: 100,
    inputTokens: 80,
    cachedInputTokens: 0,
    cacheWriteInputTokens: 0,
    reasoningOutputTokens: 3,
  });

  expect(findNewCall(100, { total: last, last })).toBeNull();
});

test('it gives null for an update of no tokens', () => {
  const last = buildMockTokenBreakdown({
    totalTokens: 0,
    inputTokens: 0,
    cachedInputTokens: 0,
    cacheWriteInputTokens: 0,
    reasoningOutputTokens: 3,
  });

  expect(findNewCall(0, { total: last, last })).toBeNull();
});

test('it counts a second call whose total grew by its last figure', () => {
  const total = buildMockTokenBreakdown({
    totalTokens: 300,
    inputTokens: 250,
    cachedInputTokens: 0,
    cacheWriteInputTokens: 0,
    reasoningOutputTokens: 3,
  });

  const last = buildMockTokenBreakdown({
    totalTokens: 120,
    inputTokens: 100,
    cachedInputTokens: 0,
    cacheWriteInputTokens: 0,
    reasoningOutputTokens: 3,
  });

  expect(findNewCall(180, { total, last })).toStrictEqual(
    expect.objectContaining({ uncachedInputTokens: 100, outputTokens: 20 }),
  );
});
