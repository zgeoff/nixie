import { expect, test } from 'bun:test';
import { buildSHA256 } from './build-sha256';

test('it gives the hex SHA-256 of a string and of the same bytes alike', () => {
  const empty = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

  expect(buildSHA256('')).toBe(empty);
  expect(buildSHA256(new Uint8Array())).toBe(empty);
});
