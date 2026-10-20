import { expect, test } from 'bun:test';
import { isUUID } from './is-uuid';

test.each([
  ['a lowercase UUID', '3f2b8c1e-5d4a-4e6f-9a7b-0c1d2e3f4a5b', true],
  ['an uppercase UUID', '3F2B8C1E-5D4A-4E6F-9A7B-0C1D2E3F4A5B', true],
  ['a UUID without hyphens', '3f2b8c1e5d4a4e6f9a7b0c1d2e3f4a5b', false],
  ['a UUID with a letter outside hex', '3f2b8c1e-5d4a-4e6f-9a7b-0c1d2e3f4a5g', false],
  ['a UUID with text after it', '3f2b8c1e-5d4a-4e6f-9a7b-0c1d2e3f4a5b-extra', false],
  ['an empty string', '', false],
])('it tells whether %s is a UUID', (_label, value, expected) => {
  expect(isUUID(value)).toBe(expected);
});
