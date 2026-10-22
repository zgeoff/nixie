import { expect, test } from 'bun:test';
import { formatItemCount } from './format-item-count';

test.each([
  [0, '0 items'],
  [1, '1 item'],
  [2, '2 items'],
])('it formats a count of %d as %s', (count, expected) => {
  expect(formatItemCount(count)).toBe(expected);
});
