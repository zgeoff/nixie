import { expect, test } from 'bun:test';
import { decodeChangeComment } from './decode-change-comment';
import { encodeChangeComment } from './encode-change-comment';
import { encodeChangeText } from './encode-change-text';

async function setupTest() {
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ]);

  return { key };
}

test('it rejects a comment sealed for another change', async () => {
  const ctx = await setupTest();
  const sealed = await encodeChangeComment(ctx.key, 'change-a', 'Keep the joke.');

  expect(decodeChangeComment(ctx.key, 'change-b', sealed)).rejects.toThrow();
});

test("it rejects a change's own text in place of its comment", async () => {
  const ctx = await setupTest();
  const sealed = await encodeChangeText(ctx.key, 'change-a', {
    text: 'Owns a cat',
    reason: 'Shorter.',
    salt: 'c2FsdA==',
  });

  expect(decodeChangeComment(ctx.key, 'change-a', sealed)).rejects.toThrow();
});
