import { expect, test } from 'bun:test';
import { deriveSecretHash } from './derive-secret-hash';

test('it derives the SHA-256 hash of a secret in hex', () => {
  expect(deriveSecretHash('abc')).toBe(
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  );
});

test('it derives the same hash for the same secret', () => {
  expect(deriveSecretHash('a session token')).toBe(deriveSecretHash('a session token'));
});
