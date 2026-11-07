import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import { fitFetchedImage } from './fit-fetched-image';
import { buildPNGHeader } from './test-utils/build-png-header';
import { encodeTestImage } from './test-utils/encode-test-image';

test('it encodes a PNG within the long edge again as a PNG of its own size', async () => {
  const bytes = await encodeTestImage({ width: 40, height: 30 }, 'png');
  const fitted = await fitFetchedImage(bytes, 1568);

  invariant(fitted.kind === 'image');

  expect(fitted).toStrictEqual({
    kind: 'image',
    image: { mediaType: 'image/png', bytes: expect.any(Uint8Array) },
    width: 40,
    height: 30,
  });

  expect(new Bun.Image(fitted.image.bytes).metadata()).resolves.toStrictEqual({
    width: 40,
    height: 30,
    format: 'png',
  });
});

test.each([
  { format: 'jpeg', mediaType: 'image/jpeg' },
  { format: 'webp', mediaType: 'image/png' },
] as const)('it encodes a small $format again as $mediaType', async (row) => {
  const bytes = await encodeTestImage({ width: 40, height: 30 }, row.format);
  const fitted = await fitFetchedImage(bytes, 1568);

  invariant(fitted.kind === 'image');

  expect(fitted.image.mediaType).toBe(row.mediaType);
});

test('it returns a PNG whose header reads cleanly but whose pixels never arrive as unreadable', () => {
  expect(fitFetchedImage(buildPNGHeader({ width: 100, height: 100 }), 1568)).resolves.toStrictEqual(
    { kind: 'unreadable', reason: 'ERR_IMAGE_DECODE_FAILED' },
  );
});

test('it returns a JPEG cut off halfway as a whole JPEG the model can read', async () => {
  const bytes = await encodeTestImage({ width: 400, height: 300 }, 'jpeg');
  const fitted = await fitFetchedImage(bytes.subarray(0, bytes.length / 2), 1568);

  invariant(fitted.kind === 'image');

  expect(new Bun.Image(fitted.image.bytes).metadata()).resolves.toStrictEqual({
    width: 400,
    height: 300,
    format: 'jpeg',
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
