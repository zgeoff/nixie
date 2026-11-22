import { expect, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import { buildStubImageProvider } from '../test-utils/build-stub-image-provider';
import { readImageID, readToolResult } from '../test-utils/read-tool-result';
import { startTestImages } from '../test-utils/start-test-images';

function setupTest() {
  return startTestImages({
    providers: { main: buildStubImageProvider(), second: buildStubImageProvider() },
  });
}

test('it pins an image and records the pin', async () => {
  const ctx = await setupTest();
  const drawn = await ctx.read('image.draw', { prompt: 'a cove' });
  const reply = await ctx.call('image.pin', { image: readImageID(drawn) });
  const records = await readRecords(ctx.log, { afterSequence: 0, kinds: ['image.pinned'] });

  expect(readToolResult(reply)).toStrictEqual({ image: readImageID(drawn), isPinned: true });

  expect(records.map((entry) => entry.record.payload)).toStrictEqual([
    { image: readImageID(drawn) },
  ]);
});

test('it unpins a pinned image and records the unpin', async () => {
  const ctx = await setupTest();
  const drawn = await ctx.read('image.draw', { prompt: 'a cove' });

  await ctx.call('image.pin', { image: readImageID(drawn) });

  const reply = await ctx.call('image.unpin', { image: readImageID(drawn) });
  const listed = await ctx.read('image.list', { isPinned: true });

  expect(readToolResult(reply)).toStrictEqual({ image: readImageID(drawn), isPinned: false });
  expect(listed['images']).toStrictEqual([]);
});

test('it refuses to pin an image that does not exist', async () => {
  const ctx = await setupTest();
  const reply = await ctx.call('image.pin', { image: 'nosuchimage' });

  expect(readToolResult(reply)).toMatchObject({ refused: { code: 'UNKNOWN_IMAGE' } });
});
