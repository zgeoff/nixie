import { expect, test } from 'bun:test';
import { readImageEntry } from '../image/read-image-entry';
import { buildStubImageProvider } from './build-stub-image-provider';
import { readImageID } from './read-tool-result';
import { startTestImages } from './start-test-images';
import { startTestLog } from './start-test-log';

test('it runs a draw through the tool endpoint and returns the image the provider drew', async () => {
  const ctx = await startTestImages({
    providers: { main: buildStubImageProvider(), second: buildStubImageProvider() },
  });

  const result = await ctx.read('image.draw', { prompt: 'a small cove' });

  expect(result).toMatchObject({ from: null, profile: 'main', size: '100x50', isShown: true });
});

test('it stores the images it draws in the log it is given', async () => {
  const log = await startTestLog();

  const ctx = await startTestImages({
    log,
    providers: { main: buildStubImageProvider(), second: buildStubImageProvider() },
  });

  const drawn = await ctx.read('image.draw', { prompt: 'a small cove' });
  const entry = await readImageEntry(log, readImageID(drawn));

  expect(entry.kind).toBe('ok');
});
