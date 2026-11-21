import { expect, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import { removeTestRecordKey } from '@heynixie/log/test-utils';
import invariant from 'tiny-invariant';
import { buildStubImageProvider } from '../test-utils/build-stub-image-provider';
import { readImageID, readToolResult } from '../test-utils/read-tool-result';
import { startTestImages } from '../test-utils/start-test-images';

function setupTest() {
  return startTestImages({
    providers: { main: buildStubImageProvider(), second: buildStubImageProvider() },
  });
}

test('it lists the images newest first, each with its prompt', async () => {
  const ctx = await setupTest();

  await ctx.call('image.draw', { prompt: 'first cove' });
  await ctx.call('image.draw', { prompt: 'second cove' });

  const listed = await ctx.read('image.list', {});

  expect(listed['images']).toMatchObject([{ prompt: 'second cove' }, { prompt: 'first cove' }]);
});

test('it pages the list, and hands back where the next page starts', async () => {
  const ctx = await setupTest();

  await ctx.call('image.draw', { prompt: 'first cove' });
  await ctx.call('image.draw', { prompt: 'second cove' });
  await ctx.call('image.draw', { prompt: 'third cove' });

  const first = await ctx.read('image.list', { limit: 2 });
  const second = await ctx.read('image.list', { limit: 2, after: String(first['next']) });

  expect(first['images']).toMatchObject([{ prompt: 'third cove' }, { prompt: 'second cove' }]);
  expect(second).toMatchObject({ images: [{ prompt: 'first cove' }], next: null });
});

test('it lists only the pinned images when asked', async () => {
  const ctx = await setupTest();
  const first = await ctx.read('image.draw', { prompt: 'first cove' });

  await ctx.call('image.draw', { prompt: 'second cove' });
  await ctx.call('image.pin', { image: readImageID(first) });

  const listed = await ctx.read('image.list', { isPinned: true });

  expect(listed['images']).toMatchObject([{ prompt: 'first cove', isPinned: true }]);
});

test('it lists a forgotten image with no prompt, and keeps it in the chain', async () => {
  const ctx = await setupTest();
  const first = await ctx.read('image.draw', { prompt: 'first cove' });

  const [stored] = await readRecords(ctx.log, {
    afterSequence: 0,
    kinds: ['tool_result'],
    order: 'newest',
    limit: 1,
  });

  invariant(stored, 'the draw wrote a result record');

  await removeTestRecordKey(ctx.log, stored.record.sequence);

  const listed = await ctx.read('image.list', {});

  expect(listed['images']).toMatchObject([
    { image: readImageID(first), prompt: null, isForgotten: true },
  ]);
});

test('it refuses the edits of an image that does not exist', async () => {
  const ctx = await setupTest();
  const reply = await ctx.call('image.list', { from: 'nosuchimage' });

  expect(readToolResult(reply)).toMatchObject({ refused: { code: 'UNKNOWN_IMAGE' } });
});

test('it lists the name an image was given last', async () => {
  const ctx = await setupTest();
  const first = await ctx.read('image.draw', { prompt: 'first cove' });

  await ctx.call('image.name', { image: readImageID(first), name: 'cove, draft' });
  await ctx.call('image.name', { image: readImageID(first), name: 'cove, final' });

  const listed = await ctx.read('image.list', {});

  expect(listed['images']).toMatchObject([{ name: 'cove, final' }]);
});
