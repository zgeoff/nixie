import { expect, test } from 'bun:test';
import { buildCallTokens } from './build-call-tokens';

test('it counts the input, the cache writes, the cache reads and the output', () => {
  expect(
    buildCallTokens({
      uncachedInputTokens: 40,
      cacheReadTokens: 800,
      cacheWrite5mTokens: 1000,
      cacheWrite1hTokens: 2000,
      outputTokens: 12,
    }),
  ).toBe(3852);
});

test('it counts the reasoning tokens once, inside the output', () => {
  expect(
    buildCallTokens({
      uncachedInputTokens: 7,
      cacheReadTokens: 0,
      cacheWrite5mTokens: 0,
      cacheWrite1hTokens: 0,
      outputTokens: 3,
      reasoningTokens: 2,
    }),
  ).toBe(10);
});
