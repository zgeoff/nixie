import { expect, test } from 'bun:test';
import { decodeVersionText } from './decode-version-text';
import { encodeVersionText } from './encode-version-text';

async function setupTest() {
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ]);

  return { key };
}

test('it rejects a sealed text copied under another version', async () => {
  const ctx = await setupTest();
  const sealed = await encodeVersionText(
    ctx.key,
    { itemID: 'item-a', version: 1 },
    { text: 'Lives on Elm Street', evidenceQuote: null, intentQuote: null },
  );

  const decode = decodeVersionText(ctx.key, { itemID: 'item-a', version: 2 }, sealed);

  expect(decode).rejects.toThrow();
});

test('it rejects a sealed text copied under another item', async () => {
  const ctx = await setupTest();
  const sealed = await encodeVersionText(
    ctx.key,
    { itemID: 'item-a', version: 1 },
    { text: 'Lives on Elm Street', evidenceQuote: null, intentQuote: null },
  );

  const decode = decodeVersionText(ctx.key, { itemID: 'item-b', version: 1 }, sealed);

  expect(decode).rejects.toThrow();
});

test('it rejects a sealed text under another key', async () => {
  const ctx = await setupTest();
  const other = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ]);
  const sealed = await encodeVersionText(
    ctx.key,
    { itemID: 'item-a', version: 1 },
    { text: 'Lives on Elm Street', evidenceQuote: null, intentQuote: null },
  );

  const decode = decodeVersionText(other, { itemID: 'item-a', version: 1 }, sealed);

  expect(decode).rejects.toThrow();
});
