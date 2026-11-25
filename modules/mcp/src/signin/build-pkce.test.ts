import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { buildPKCE } from './build-pkce';

test('it gives a challenge that is the S256 hash of the verifier', () => {
  const pkce = buildPKCE();

  expect(pkce.challenge).toBe(createHash('sha256').update(pkce.verifier).digest('base64url'));
});

test('it gives a verifier of 43 URL-safe characters', () => {
  expect(buildPKCE().verifier).toMatch(/^[A-Za-z0-9_-]{43}$/u);
});

test('it gives another verifier each time', () => {
  expect(buildPKCE().verifier).not.toBe(buildPKCE().verifier);
});
