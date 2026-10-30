import { expect, test } from 'bun:test';
import { ORPCError } from '@orpc/client';
import { isPermanentRefusal } from './is-permanent-refusal.ts';

test.each([
  [400, true],
  [401, true],
  [404, true],
  [409, true],
  [408, false],
  [429, false],
  [500, false],
  [503, false],
])('it judges an answer of %d permanent: %p', (status, expected) => {
  expect(isPermanentRefusal(new ORPCError('ANY', { status }))).toBe(expected);
});

test('it judges a network failure passing', () => {
  expect(isPermanentRefusal(new TypeError('fetch failed'))).toBe(false);
});
