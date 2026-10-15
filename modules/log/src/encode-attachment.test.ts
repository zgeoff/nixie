import { expect, test } from 'bun:test';
import { encodeAttachment } from './encode-attachment';

async function setupTest() {
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ]);

  return { key };
}

test('it holds no plaintext of the bytes', async () => {
  const ctx = await setupTest();

  const bytes = new TextEncoder().encode('imagemarker4417');

  const sealed = await encodeAttachment(ctx.key, 'key-1', { position: 0, bytes });

  expect(new TextDecoder().decode(sealed)).not.toInclude('imagemarker4417');
});

test('it encodes the same bytes differently each time', async () => {
  const ctx = await setupTest();

  const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);

  const first = await encodeAttachment(ctx.key, 'key-1', { position: 0, bytes });
  const second = await encodeAttachment(ctx.key, 'key-1', { position: 0, bytes });

  expect(first).not.toStrictEqual(second);
});
