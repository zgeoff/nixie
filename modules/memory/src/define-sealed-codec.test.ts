import { expect, test } from 'bun:test';
import { z } from 'zod';
import { defineSealedCodec } from './define-sealed-codec';

async function setupTest() {
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ]);

  return { key };
}

test('it opens a value in the place it was sealed for', async () => {
  const ctx = await setupTest();

  const codec = defineSealedCodec('note/', z.strictObject({ text: z.string() }));

  const sealed = await codec.encode(ctx.key, 'item-a', { text: 'Owns a cat' });
  const value = await codec.decode(ctx.key, 'item-a', sealed);

  expect(value).toStrictEqual({ text: 'Owns a cat' });
});

test('it binds the prefix and the place joined as the additional data', async () => {
  const ctx = await setupTest();

  const ratings = defineSealedCodec('note/', z.strictObject({ text: z.string() }));
  const items = defineSealedCodec('note/rating-a/', z.strictObject({ text: z.string() }));

  const sealed = await ratings.encode(ctx.key, 'rating-a/item-a', { text: 'Owns a cat' });
  const value = await items.decode(ctx.key, 'item-a', sealed);

  expect(value).toStrictEqual({ text: 'Owns a cat' });
});

test('it rejects a value sealed for another place', async () => {
  const ctx = await setupTest();

  const codec = defineSealedCodec('note/', z.strictObject({ text: z.string() }));

  const sealed = await codec.encode(ctx.key, 'item-a', { text: 'Owns a cat' });

  expect(codec.decode(ctx.key, 'item-b', sealed)).rejects.toThrow();
});

test("it rejects a value of another codec's shape sealed under the same prefix", async () => {
  const ctx = await setupTest();

  const share = defineSealedCodec('note/', z.base64());
  const note = defineSealedCodec('note/', z.strictObject({ text: z.string() }));

  const sealed = await share.encode(ctx.key, 'item-a', 'c2FsdA==');

  expect(note.decode(ctx.key, 'item-a', sealed)).rejects.toThrow(z.ZodError);
});

test('it rejects a value the schema refuses before it seals one', async () => {
  const ctx = await setupTest();

  const codec = defineSealedCodec('note/', z.base64());

  expect(codec.encode(ctx.key, 'item-a', 'not base64!')).rejects.toThrow(z.ZodError);
});
