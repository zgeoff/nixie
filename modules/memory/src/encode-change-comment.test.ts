import { expect, test } from 'bun:test';
import { decodeChangeComment } from './decode-change-comment';
import { encodeChangeComment } from './encode-change-comment';

async function setupTest() {
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ]);

  return { key };
}

test('it seals a comment that opens under the same change', async () => {
  const ctx = await setupTest();

  const sealed = await encodeChangeComment(ctx.key, 'change-a', 'Keep the joke.');

  const result = await decodeChangeComment(ctx.key, 'change-a', sealed);

  expect(result).toBe('Keep the joke.');
});

test('it writes base64 with no plain text in it', async () => {
  const ctx = await setupTest();

  const sealed = await encodeChangeComment(ctx.key, 'change-a', 'Keep the joke.');

  expect(sealed).toMatch(/^[A-Za-z0-9+/]+=*$/u);
  expect(Buffer.from(sealed, 'base64').toString('latin1')).not.toInclude('joke');
});
