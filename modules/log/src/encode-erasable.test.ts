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

test('it decodes what it encoded under the same key and key ID', async () => {
  const ctx = await setupTest();

  const sealed = await encodeErasable(ctx.key, 'key-1', { text: 'call the bank', count: 2 });
  const decoded = await decodeErasable(ctx.key, 'key-1', sealed);

  expect(decoded).toStrictEqual({
    text: 'call the bank',
    count: 2,
  });
});

test('it holds no plaintext of the fields', async () => {
  const ctx = await setupTest();

  const sealed = await encodeErasable(ctx.key, 'key-1', { text: 'secretmarker3301' });

  expect(new TextDecoder().decode(sealed)).not.toInclude('secretmarker3301');
});

test('it encodes the same fields differently each time', async () => {
  const ctx = await setupTest();

  const first = await encodeErasable(ctx.key, 'key-1', { text: 'same' });
  const second = await encodeErasable(ctx.key, 'key-1', { text: 'same' });

  expect(first).not.toStrictEqual(second);
});

test('it refuses to decode under another key ID', async () => {
  const ctx = await setupTest();

  const sealed = await encodeErasable(ctx.key, 'key-1', { text: 'call the bank' });
  const decode = decodeErasable(ctx.key, 'key-2', sealed);

  await decode.catch(() => {});

  expect(decode).rejects.toThrow();
});

test('it refuses to decode a changed byte', async () => {
  const ctx = await setupTest();

  const sealed = await encodeErasable(ctx.key, 'key-1', { text: 'call the bank' });

  sealed[sealed.length - 1] = (sealed.at(-1) ?? 0) ^ 1;
  const decode = decodeErasable(ctx.key, 'key-1', sealed);

  await decode.catch(() => {});

  expect(decode).rejects.toThrow();
});
