import { expect, test } from 'bun:test';
import { countBatchTokens } from './count-batch-tokens';

test.each([
  ['', 0],
  ['a', 1],
  ['abcd', 1],
  ['abcde', 2],
  ['abcdefgh', 2],
])('it counts %p as %d tokens', (text, expected) => {
  expect(countBatchTokens(text)).toBe(expected);
});
