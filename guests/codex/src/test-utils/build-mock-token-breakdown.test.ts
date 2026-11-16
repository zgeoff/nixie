import { expect, test } from 'bun:test';
import { buildMockTokenBreakdown } from './build-mock-token-breakdown';

test('it builds a default breakdown whose output is the total less the input', () => {
  expect(buildMockTokenBreakdown()).toStrictEqual({
    totalTokens: 110,
    inputTokens: 100,
    cachedInputTokens: 0,
    cacheWriteInputTokens: 0,
    outputTokens: 10,
    reasoningOutputTokens: 1,
  });
});

test('it applies overrides on top of the defaults', () => {
  expect(
    buildMockTokenBreakdown({ totalTokens: 240, inputTokens: 220, cachedInputTokens: 90 }),
  ).toStrictEqual({
    totalTokens: 240,
    inputTokens: 220,
    cachedInputTokens: 90,
    cacheWriteInputTokens: 0,
    outputTokens: 20,
    reasoningOutputTokens: 1,
  });
});
