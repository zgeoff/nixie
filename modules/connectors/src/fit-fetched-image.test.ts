import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import { fitFetchedImage } from './fit-fetched-image';
import { buildPNGHeader } from './test-utils/build-png-header';
import { encodeTestImage } from './test-utils/encode-test-image';

test('it keeps a PNG within the long edge byte for byte', async () => {
  const bytes = await encodeTestImage({ width: 40, height: 30 }, 'png');

  expect(fitFetchedImage(bytes, 1568)).resolves.toStrictEqual({
    kind: 'image',
    image: { mediaType: 'image/png', bytes },
    width: 40,
    height: 30,
  });
});

test('it downscales a PNG past the long edge to fit it, as a PNG', async () => {
  const bytes = await encodeTestImage({ width: 3000, height: 1500 }, 'png');
  const fitted = await fitFetchedImage(bytes, 1568);

  invariant(fitted.kind === 'image');

  expect(fitted).toStrictEqual({
    kind: 'image',
    image: { mediaType: 'image/png', bytes: expect.any(Uint8Array) },
    width: 1568,
    height: 784,
  });

  expect(new Bun.Image(fitted.image.bytes).metadata()).resolves.toStrictEqual({
    width: 1568,
    height: 784,
    format: 'png',
  });
});

test('it downscales a JPEG past the long edge as a JPEG', async () => {
  const bytes = await encodeTestImage({ width: 1000, height: 2000 }, 'jpeg');
  const fitted = await fitFetchedImage(bytes, 500);

  invariant(fitted.kind === 'image');

  expect(new Bun.Image(fitted.image.bytes).metadata()).resolves.toStrictEqual({
    width: 250,
    height: 500,
    format: 'jpeg',
  });
});

test('it returns a body that is no image as unreadable, with the reason', () => {
  expect(
    fitFetchedImage(new TextEncoder().encode('<html>gone</html>'), 1568),
  ).resolves.toStrictEqual({ kind: 'unreadable', reason: 'ERR_IMAGE_UNKNOWN_FORMAT' });
});

test('it returns an image whose header claims more than 25 million pixels as unreadable', () => {
  expect(
    fitFetchedImage(buildPNGHeader({ width: 10_000, height: 8000 }), 1568),
  ).resolves.toStrictEqual({ kind: 'unreadable', reason: 'ERR_IMAGE_TOO_MANY_PIXELS' });
});
