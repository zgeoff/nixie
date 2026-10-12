import { expect, test } from 'bun:test';
import { buildSHA256 } from './build-sha256';

test('it gives the hex SHA-256 of the FIPS 180-2 test vector', () => {
  expect(buildSHA256('abc')).toBe(
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  );
});

test('it gives the same hash for the same input', () => {
  expect(buildSHA256('# Persona\n')).toBe(buildSHA256('# Persona\n'));
});

test('it gives the hex SHA-256 of a string and of the same bytes alike', () => {
  const empty = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

  expect(buildSHA256('')).toBe(empty);
  expect(buildSHA256(new Uint8Array())).toBe(empty);
});
