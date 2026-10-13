import { expect, test } from 'bun:test';
import { formatTokenCount } from './format-token-count';

test.each([
  [0, '0'],
  [850, '850'],
  [1000, '1k'],
  [3240, '3.2k'],
  [9960, '10k'],
  [41_000, '41k'],
  [41_499, '41k'],
  [400_000, '400k'],
  [999_600, '1M'],
  [1_200_000, '1.2M'],
])('it formats %d tokens as %s', (tokens, expected) => {
  expect(formatTokenCount(tokens)).toBe(expected);
});
