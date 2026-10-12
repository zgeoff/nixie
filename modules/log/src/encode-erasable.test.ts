import { expect, test } from 'bun:test';
import { encodeErasable } from './encode-erasable';

async function setupTest() {
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ]);

  return { key };
}

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
