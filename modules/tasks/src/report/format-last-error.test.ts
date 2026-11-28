import { expect, test } from 'bun:test';
import { formatLastError } from './format-last-error';

test.each([
  ['a short message', 'rate limit exceeded', 'The last error: rate limit exceeded'],
  ['a message of 2000 characters', 'e'.repeat(2000), `The last error: ${'e'.repeat(2000)}`],
  ['a message of 2001 characters', 'e'.repeat(2001), `The last error: ${'e'.repeat(2000)} (cut)`],
])('it formats %s', (_, message, expected) => {
  expect(formatLastError(message)).toBe(expected);
});
