import { expect, test } from 'bun:test';
import { buildStubImageProvider } from '../test-utils/build-stub-image-provider';
import { readImageID, readToolResult } from '../test-utils/read-tool-result';
import { startTestImages } from '../test-utils/start-test-images';

test('it shows a stored image again with the prompt it was drawn from', async () => {
  const ctx = await startTestImages({
    providers: { main: buildStubImageProvider(), second: buildStubImageProvider() },
  });

  const drawn = await ctx.read('image.draw', { prompt: 'a small cove' });
  const reply = await ctx.call('image.read', { image: readImageID(drawn) });

  expect(readToolResult(reply)).toStrictEqual({
    image: readImageID(drawn),
    from: null,
    prompt: 'a small cove',
    size: '100x50',
    isShown: true,
    roomLeft: 3,
  });

  expect(reply.content.map((block) => block.type)).toStrictEqual(['text', 'image']);
});

test('it reports no picture shown when the session caps have no room', async () => {
  const ctx = await startTestImages({
    providers: { main: buildStubImageProvider(), second: buildStubImageProvider() },
    caps: { bytes: 24 * 1024 * 1024, count: 1 },
  });

  const drawn = await ctx.read('image.draw', { prompt: 'a small cove' });
  const reply = await ctx.call('image.read', { image: readImageID(drawn) });

  expect(readToolResult(reply)).toMatchObject({ isShown: false, roomLeft: 0 });
});

test('it refuses an image that does not exist', async () => {
  const ctx = await startTestImages({
    providers: { main: buildStubImageProvider(), second: buildStubImageProvider() },
  });

  const reply = await ctx.call('image.read', { image: 'nosuchimage' });

  expect(readToolResult(reply)).toMatchObject({ refused: { code: 'UNKNOWN_IMAGE' } });
});
