import { expect, test } from 'bun:test';
import { encodeTestImage } from '../test-utils/encode-test-image';
import { padPng } from './pad-png';
import { readPngPixels } from './read-png-pixels';

test('it pads a wide picture into a canvas, keeping the picture in the middle and the rest clear', async () => {
  const wide = await encodeTestImage({ width: 200, height: 50 }, 'png');
  const padded = await padPng(wide, { width: 100, height: 100 });

  const pixels = readPngPixels(padded ?? new Uint8Array(0));
  const alphaAt = (x: number, y: number) => pixels?.rgba[(y * 100 + x) * 4 + 3];

  expect({
    size: [pixels?.width, pixels?.height],
    top: alphaAt(50, 5),
    middle: alphaAt(50, 50),
  }).toStrictEqual({
    size: [100, 100],
    top: 0,
    middle: 255,
  });
});

test('it keeps the colour of the picture it pads', async () => {
  const square = await encodeTestImage({ width: 10, height: 10 }, 'png');
  const padded = await padPng(square, { width: 40, height: 20 });

  const pixels = readPngPixels(padded ?? new Uint8Array(0));

  expect([
    ...(pixels?.rgba.subarray((10 * 40 + 20) * 4, (10 * 40 + 20) * 4 + 4) ?? []),
  ]).toStrictEqual([255, 0, 0, 255]);
});

test('it reads null for bytes that are no PNG', () => {
  expect(readPngPixels(new Uint8Array([1, 2, 3]))).toBeNull();
});
