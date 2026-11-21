import { expect, test } from 'bun:test';
import { buildStubImageProvider } from './build-stub-image-provider';

function setupTest() {
  const provider = buildStubImageProvider();

  const signal = new AbortController().signal;

  return {
    draw: (size: '1024x1024' | '1536x1024', source?: Uint8Array) =>
      provider.draw({
        model: 'model-a',
        prompt: 'a heron',
        size,
        references: [],
        signal,
        ...(source === undefined ? {} : { source: { mediaType: 'image/png', bytes: source } }),
      }),
  };
}

test('it draws a PNG at the size asked', async () => {
  const ctx = setupTest();

  const reply = await ctx.draw('1536x1024');

  const bytes = reply.kind === 'image' ? reply.bytes : new Uint8Array();

  const metadata = await new Bun.Image(bytes).metadata();

  expect([reply.kind, metadata.width, metadata.height]).toStrictEqual(['image', 1536, 1024]);
});

test('it answers an edit with a picture that differs from its source', async () => {
  const ctx = setupTest();

  const drawn = await ctx.draw('1024x1024');

  const source = drawn.kind === 'image' ? drawn.bytes : new Uint8Array();

  const edited = await ctx.draw('1024x1024', source);

  const bytes = edited.kind === 'image' ? edited.bytes : new Uint8Array();

  expect([edited.kind, Buffer.from(bytes).equals(Buffer.from(source))]).toStrictEqual([
    'image',
    false,
  ]);
});
