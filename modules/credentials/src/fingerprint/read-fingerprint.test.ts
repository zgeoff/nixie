import { expect, test } from 'bun:test';
import { deriveFingerprintKey } from './derive-fingerprint-key';
import { readFingerprint } from './read-fingerprint';

async function setupTest() {
  return {
    key: await deriveFingerprintKey(Buffer.alloc(32, 3)),
    otherKey: await deriveFingerprintKey(Buffer.alloc(32, 4)),
  };
}

test('it gives 8 hex digits', async () => {
  const ctx = await setupTest();
  const fingerprint = await readFingerprint('fake-search-value', ctx.key);

  expect(fingerprint).toMatch(/^[0-9a-f]{8}$/u);
});

test('it gives one value the same fingerprint every time', async () => {
  const ctx = await setupTest();
  const first = await readFingerprint('fake-search-value', ctx.key);
  const second = await readFingerprint('fake-search-value', ctx.key);

  expect(first).toBe(second);
});

test('it changes with the value', async () => {
  const ctx = await setupTest();
  const first = await readFingerprint('fake-search-value', ctx.key);
  const second = await readFingerprint('fake-search-value-2', ctx.key);

  expect(first).not.toBe(second);
});

test('it changes with the key, so it is no unkeyed hash of the value', async () => {
  const ctx = await setupTest();
  const first = await readFingerprint('fake-search-value', ctx.key);
  const second = await readFingerprint('fake-search-value', ctx.otherKey);

  expect(first).not.toBe(second);
});

test('it differs from the first 8 digits of the value hashed without a key', async () => {
  const ctx = await setupTest();

  const unkeyed = new Bun.CryptoHasher('sha256').update('fake-search-value').digest('hex');

  const fingerprint = await readFingerprint('fake-search-value', ctx.key);

  expect(fingerprint).not.toBe(unkeyed.slice(0, 8));
});
