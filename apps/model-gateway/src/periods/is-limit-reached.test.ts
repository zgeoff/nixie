import { expect, test } from 'bun:test';
import { isLimitReached } from './is-limit-reached';

test.each([
  { name: 'a count under the limit', spent: 990_000, limit: 1, expected: false },
  { name: 'a count one micro under the limit', spent: 999_999, limit: 1, expected: false },
  { name: 'a count at the limit', spent: 1_000_000, limit: 1, expected: true },
  { name: 'a count over the limit', spent: 1_500_000, limit: 1, expected: true },
])('#isLimitReached answers $expected for $name', (row) => {
  expect(isLimitReached(row.spent, row.limit)).toBe(row.expected);
});

test('#isLimitReached finds ten replies of 0.1 dollars at a limit of 1 dollar', () => {
  expect(isLimitReached(10 * 100_000, 1)).toBe(true);
});
