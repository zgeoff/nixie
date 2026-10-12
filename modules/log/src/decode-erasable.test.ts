import { expect, test } from 'bun:test';
import { decodeErasable } from './decode-erasable';
import { encodeErasable } from './encode-erasable';

async function setupTest() {
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ]);

  return { key };
}

test('it returns the fields that encodeErasable sealed under the same key and key ID', async () => {
  const ctx = await setupTest();

  const sealed = await encodeErasable(ctx.key, 'key-1', { text: 'call the bank', count: 2 });
  const decoded = await decodeErasable(ctx.key, 'key-1', sealed);

  expect(decoded).toStrictEqual({
    text: 'call the bank',
    count: 2,
  });
});

test('it refuses fields sealed under another key ID', async () => {
  const ctx = await setupTest();

  const sealed = await encodeErasable(ctx.key, 'key-1', { text: 'call the bank' });
  const decode = decodeErasable(ctx.key, 'key-2', sealed);

  await decode.catch(() => {});

  expect(decode).rejects.toThrow();
});

test('it refuses sealed fields with a changed byte', async () => {
  const ctx = await setupTest();

  const sealed = await encodeErasable(ctx.key, 'key-1', { text: 'call the bank' });

  sealed[sealed.length - 1] = (sealed.at(-1) ?? 0) ^ 1;
  const decode = decodeErasable(ctx.key, 'key-1', sealed);

  await decode.catch(() => {});

  expect(decode).rejects.toThrow();
});
