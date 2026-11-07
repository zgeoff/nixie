import { expect, test } from 'bun:test';
import { pickImageFit } from './pick-image-fit';

test.each([
  { format: 'png', width: 800, height: 600, mediaType: 'image/png' },
  { format: 'jpeg', width: 1568, height: 1000, mediaType: 'image/jpeg' },
  { format: 'webp', width: 600, height: 1568, mediaType: 'image/webp' },
  { format: 'gif', width: 64, height: 64, mediaType: 'image/gif' },
] as const)('it keeps a $format of $width by $height within the long edge as it is', (row) => {
  expect(
    pickImageFit({ format: row.format, width: row.width, height: row.height, bytes: 4096 }, 1568),
  ).toStrictEqual({ kind: 'keep', mediaType: row.mediaType });
});

test.each([
  { format: 'png', width: 3000, height: 1500, encoding: 'png' },
  { format: 'jpeg', width: 4000, height: 3000, encoding: 'jpeg' },
  { format: 'webp', width: 1569, height: 100, encoding: 'png' },
  { format: 'gif', width: 100, height: 2000, encoding: 'png' },
] as const)(
  'it encodes a $format of $width by $height past the long edge as a $encoding',
  (row) => {
    expect(
      pickImageFit({ format: row.format, width: row.width, height: row.height, bytes: 4096 }, 1568),
    ).toStrictEqual({ kind: 'encode', format: row.encoding });
  },
);

test.each(['bmp', 'tiff', 'heic', 'avif'] as const)(
  'it encodes a small %s, which the model does not take, as a PNG',
  (format) => {
    expect(pickImageFit({ format, width: 100, height: 100, bytes: 4096 }, 1568)).toStrictEqual({
      kind: 'encode',
      format: 'png',
    });
  },
);

test('it encodes a small image past the 5 MiB the model takes', () => {
  expect(
    pickImageFit({ format: 'png', width: 1000, height: 1000, bytes: 5_242_881 }, 1568),
  ).toStrictEqual({ kind: 'encode', format: 'png' });
});

test('it keeps a small image at exactly the 5 MiB the model takes', () => {
  expect(
    pickImageFit({ format: 'png', width: 1000, height: 1000, bytes: 5_242_880 }, 1568),
  ).toStrictEqual({ kind: 'keep', mediaType: 'image/png' });
});
