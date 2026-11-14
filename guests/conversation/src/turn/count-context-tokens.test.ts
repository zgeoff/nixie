import { expect, test } from 'bun:test';
import { countContextTokens } from './count-context-tokens';

test('it counts fresh input, cache reads and cache writes as the context', () => {
  expect(
    countContextTokens({
      input_tokens: 300,
      cache_read_input_tokens: 38_000,
      cache_creation_input_tokens: 2700,
    }),
  ).toBe(41_000);
});

test('it counts a call that reported no cache usage by its input alone', () => {
  expect(
    countContextTokens({
      input_tokens: 300,
      cache_read_input_tokens: null,
      cache_creation_input_tokens: null,
    }),
  ).toBe(300);
});
