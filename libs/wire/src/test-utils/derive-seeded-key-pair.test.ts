import { expect, test } from 'bun:test';
import { isP256Point } from '../is-p256-point';
import { deriveSeededKeyPair } from './derive-seeded-key-pair';

test('it derives the same public key from the same seed', async () => {
  const first = await deriveSeededKeyPair('invented seed');
  const second = await deriveSeededKeyPair('invented seed');

  expect(first.publicKey).toStrictEqual(second.publicKey);
});

test('it derives another public key from another seed', async () => {
  const first = await deriveSeededKeyPair('invented seed');
  const second = await deriveSeededKeyPair('another invented seed');

  expect(first.publicKey).not.toStrictEqual(second.publicKey);
});

test('it derives a public key that is a point on the curve', async () => {
  const pair = await deriveSeededKeyPair('invented seed');

  expect(isP256Point(pair.publicKey)).toBeTrue();
});
