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

test('it names an image', async () => {
  const ctx = await setupTest();
  const drawn = await ctx.read('image.draw', { prompt: 'a cove' });
  const reply = await ctx.call('image.name', { image: readImageID(drawn), name: 'cove, final' });

  expect(readToolResult(reply)).toStrictEqual({ image: readImageID(drawn), name: 'cove, final' });
});

test('it clears the name with null', async () => {
  const ctx = await setupTest();
  const drawn = await ctx.read('image.draw', { prompt: 'a cove' });

  await ctx.call('image.name', { image: readImageID(drawn), name: 'cove, final' });
  await ctx.call('image.name', { image: readImageID(drawn), name: null });

  const listed = await ctx.read('image.list', {});

  expect(listed['images']).toMatchObject([{ name: null }]);
});

test('it keeps the name among the erasable fields of its record, never in the payload', async () => {
  const ctx = await setupTest();
  const drawn = await ctx.read('image.draw', { prompt: 'a cove' });

  await ctx.call('image.name', { image: readImageID(drawn), name: 'cove, final' });

  const [named] = await readRecords(ctx.log, { afterSequence: 0, kinds: ['image.named'] });

  expect(named?.record).toMatchObject({
    payload: { image: readImageID(drawn) },
    erasable: { status: 'readable', fields: { name: 'cove, final' } },
  });
});

test('it refuses an image that does not exist', async () => {
  const ctx = await setupTest();
  const reply = await ctx.call('image.name', { image: 'nosuchimage', name: 'x' });

  expect(readToolResult(reply)).toMatchObject({ refused: { code: 'UNKNOWN_IMAGE' } });
});
