import { expect, test } from 'bun:test';
import { openWithKey } from './open-with-key';
import { sealWithKey } from './seal-with-key';

async function setupTest() {
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ]);

  return { key };
}

test('it opens what it sealed under the same additional data', async () => {
  const ctx = await setupTest();
  const sealed = await sealWithKey(ctx.key, 'key#input', new TextEncoder().encode('a body'));
  const received1 = await openWithKey(ctx.key, 'key#input', sealed);

  expect(received1).toStrictEqual(new TextEncoder().encode('a body'));
});

test('it opens nothing under other additional data', async () => {
  const ctx = await setupTest();
  const sealed = await sealWithKey(ctx.key, 'key#input', new TextEncoder().encode('a body'));
  const received2 = await openWithKey(ctx.key, 'key#other', sealed);

  expect(received2).toBeNull();
});

test('it opens nothing of a cut file', async () => {
  const ctx = await setupTest();
  const received3 = await openWithKey(ctx.key, 'key#input', new Uint8Array(5));

  expect(received3).toBeNull();
});
