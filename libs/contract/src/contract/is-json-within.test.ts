import { expect, test } from 'bun:test';
import { isJSONWithin } from './is-json-within';

test.each([
  { title: 'at the limit', value: 'abcd', limit: 6, expected: true },
  { title: 'past the limit', value: 'abcde', limit: 6, expected: false },
  { title: 'counting bytes rather than characters', value: 'é', limit: 3, expected: false },
])('#isJSONWithin says $expected for a value $title', (row) => {
  expect(isJSONWithin(row.value, row.limit)).toBe(row.expected);
});
