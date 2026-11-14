import { expect, test } from 'bun:test';
import { deriveSpoolKey } from './derive-spool-key';
import { deriveSeededKeyPair } from './test-utils';

async function setupTest() {
  const sender = await deriveSeededKeyPair('nixie spool key test sender');
  const recipient = await deriveSeededKeyPair('nixie spool key test recipient');

  return {
    sender,
    recipient,
    iv: new Uint8Array(12),
    plain: new TextEncoder().encode('name three harbour birds'),
  };
}

test('it derives the same key for the two sides of the exchange', async () => {
  const ctx = await setupTest();

  const sealKey = await deriveSpoolKey(
    ctx.sender.privateKey,
    ctx.recipient.publicKey,
    ctx.sender.publicKey,
  );

  const openKey = await deriveSpoolKey(
    ctx.recipient.privateKey,
    ctx.sender.publicKey,
    ctx.sender.publicKey,
  );

  const sealed = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: ctx.iv }, sealKey, ctx.plain);
  const opened = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ctx.iv }, openKey, sealed);

  expect(new Uint8Array(opened)).toStrictEqual(ctx.plain);
});

test('it derives a different key for a different salt', async () => {
  const ctx = await setupTest();

  const sealKey = await deriveSpoolKey(
    ctx.sender.privateKey,
    ctx.recipient.publicKey,
    ctx.sender.publicKey,
  );

  const otherKey = await deriveSpoolKey(
    ctx.recipient.privateKey,
    ctx.sender.publicKey,
    ctx.recipient.publicKey,
  );

  const sealed = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: ctx.iv }, sealKey, ctx.plain);

  expect(
    crypto.subtle.decrypt({ name: 'AES-GCM', iv: ctx.iv }, otherKey, sealed),
  ).rejects.toThrow();
});

test('it rejects a peer key that is not a P-256 point', async () => {
  const ctx = await setupTest();

  expect(
    deriveSpoolKey(ctx.sender.privateKey, new Uint8Array(65), ctx.sender.publicKey),
  ).rejects.toThrow();
});
