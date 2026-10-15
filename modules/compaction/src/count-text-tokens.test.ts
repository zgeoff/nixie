import { expect, test } from 'bun:test';
import { countTextTokens } from './count-text-tokens';

test.each([
  ['', 0],
  ['abcd', 1],
  ['abcde', 2],
  ['Goes by Sam', 3],
])('it counts %p as %d tokens', (text, tokens) => {
  expect(countTextTokens(text)).toBe(tokens);
});
