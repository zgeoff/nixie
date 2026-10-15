import { expect, test } from 'bun:test';
import { decodeAttachment } from './decode-attachment';
import { encodeAttachment } from './encode-attachment';

async function setupTest() {
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ]);

  return { key };
}

test('it returns the bytes that encodeAttachment sealed under the same key, key ID and position', async () => {
  const ctx = await setupTest();

  const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

  const sealed = await encodeAttachment(ctx.key, 'key-1', { position: 1, bytes });
  const decoded = await decodeAttachment(ctx.key, 'key-1', { position: 1, sealed });

  expect(decoded).toStrictEqual(new Uint8Array([0x89, 0x50, 0x4e, 0x47]));
});

test('it refuses bytes sealed under another key ID', async () => {
  const ctx = await setupTest();

  const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

  const sealed = await encodeAttachment(ctx.key, 'key-1', { position: 0, bytes });

  const decode = decodeAttachment(ctx.key, 'key-2', { position: 0, sealed });

  await decode.catch(() => {});

  expect(decode).rejects.toThrow();
});

test('it refuses bytes sealed at another position', async () => {
  const ctx = await setupTest();

  const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

  const sealed = await encodeAttachment(ctx.key, 'key-1', { position: 0, bytes });

  const decode = decodeAttachment(ctx.key, 'key-1', { position: 1, sealed });

  await decode.catch(() => {});

  expect(decode).rejects.toThrow();
});

test('it refuses sealed bytes with a changed byte', async () => {
  const ctx = await setupTest();

  const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

  const sealed = await encodeAttachment(ctx.key, 'key-1', { position: 0, bytes });

  sealed[sealed.length - 1] = (sealed.at(-1) ?? 0) ^ 1;

  const decode = decodeAttachment(ctx.key, 'key-1', { position: 0, sealed });

  await decode.catch(() => {});

  expect(decode).rejects.toThrow();
});
