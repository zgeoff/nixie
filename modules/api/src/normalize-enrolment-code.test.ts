import { expect, test } from 'bun:test';
import { normalizeEnrolmentCode } from './normalize-enrolment-code';

test.each([
  ['K7P2X-Q9M4D', 'K7P2XQ9M4D'],
  ['k7p2x-q9m4d', 'K7P2XQ9M4D'],
  [' K7P2X Q9M4D ', 'K7P2XQ9M4D'],
  ['K7P2X-Q9M4O', 'K7P2XQ9M40'],
  ['k7p2x-q9m4i', 'K7P2XQ9M41'],
  ['K7P2X-Q9M4L', 'K7P2XQ9M41'],
])('it normalizes %p to %p', (input, expected) => {
  expect(normalizeEnrolmentCode(input)).toBe(expected);
});
