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

test('it seals a version text that opens under the same item and version', async () => {
  const ctx = await setupTest();
  const text = { text: 'Lives on Elm Street', evidenceQuote: 'my flat', intentQuote: null };

  const sealed = await encodeVersionText(ctx.key, { itemID: 'item-a', version: 2 }, text);

  const result = await decodeVersionText(ctx.key, { itemID: 'item-a', version: 2 }, sealed);

  expect(result).toStrictEqual(text);
});

test('it seals the same text differently each time', async () => {
  const ctx = await setupTest();
  const text = { text: 'Lives on Elm Street', evidenceQuote: null, intentQuote: null };

  const first = await encodeVersionText(ctx.key, { itemID: 'item-a', version: 1 }, text);
  const second = await encodeVersionText(ctx.key, { itemID: 'item-a', version: 1 }, text);

  expect(first).not.toBe(second);
});

test('it writes base64 with no plain text in it', async () => {
  const ctx = await setupTest();

  const sealed = await encodeVersionText(
    ctx.key,
    { itemID: 'item-a', version: 1 },
    { text: 'Lives on Elm Street', evidenceQuote: null, intentQuote: null },
  );

  expect(sealed).toMatch(/^[A-Za-z0-9+/]+=*$/u);
  expect(Buffer.from(sealed, 'base64').toString('latin1')).not.toInclude('Elm');
});
