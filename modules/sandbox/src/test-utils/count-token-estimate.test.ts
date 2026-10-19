import { expect, test } from 'bun:test';
import { countTokenEstimate } from './count-token-estimate';

test.each([
  ['', 0],
  ['abcd', 1],
  ['abcde', 2],
  ['x'.repeat(400), 100],
])('it counts %p as %d tokens', (text, expected) => {
  expect(countTokenEstimate(text)).toBe(expected);
});
