import { expect, test } from 'bun:test';
import { buildCallTokens } from './build-call-tokens';

test('it counts the input, the cache writes, the cache reads and the output', () => {
  expect(
    buildCallTokens({
      input_tokens: 40,
      output_tokens: 12,
      cache_creation_input_tokens: 3000,
      cache_read_input_tokens: 800,
      cache_creation: { ephemeral_5m_input_tokens: 1000, ephemeral_1h_input_tokens: 2000 },
    }),
  ).toBe(3852);
});

test('it counts the larger cache write figure when the split and the total disagree', () => {
  expect(
    buildCallTokens({
      input_tokens: 0,
      output_tokens: 0,
      cache_creation_input_tokens: 100,
      cache_creation: { ephemeral_5m_input_tokens: 300, ephemeral_1h_input_tokens: 200 },
    }),
  ).toBe(500);
});

test('it counts only the input and the output of a reply with no cache figures', () => {
  expect(buildCallTokens({ input_tokens: 7, output_tokens: 3 })).toBe(10);
});
