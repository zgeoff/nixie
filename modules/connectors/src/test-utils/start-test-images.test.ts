import { expect, test } from 'bun:test';
import { buildStubImageProvider } from './build-stub-image-provider';
import { startTestImages } from './start-test-images';

test('it runs a draw through the tool endpoint and returns the image the provider drew', async () => {
  const ctx = await startTestImages({
    providers: { main: buildStubImageProvider(), second: buildStubImageProvider() },
  });

  const result = await ctx.read('image.draw', { prompt: 'a small cove' });

  expect(result).toMatchObject({ from: null, profile: 'main', size: '100x50', isShown: true });
});
