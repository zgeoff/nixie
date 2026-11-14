import { expect, test } from 'bun:test';
import { readOwnerImages } from './read-owner-images';

test('it reads each image with the type its bytes hold, not the type it claims', async () => {
  const result = await readOwnerImages([
    new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], {
      type: 'image/jpeg',
    }),
    new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])]),
  ]);

  expect(result).toStrictEqual({
    status: 'read',
    images: [
      {
        mediaType: 'image/png',
        bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      },
      { mediaType: 'image/jpeg', bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe0]) },
    ],
  });
});

test('it reads no images as none', async () => {
  const result = await readOwnerImages([]);

  expect(result).toStrictEqual({ status: 'read', images: [] });
});

test('it takes an image of exactly 5 MB', async () => {
  const bytes = new Uint8Array(5 * 1024 * 1024);

  bytes.set([0xff, 0xd8, 0xff, 0xe0]);

  const result = await readOwnerImages([new Blob([bytes])]);

  expect(result.status).toBe('read');
});

test('it refuses a fifth image before it reads any', async () => {
  const result = await readOwnerImages(
    Array.from({ length: 5 }, () => new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])])),
  );

  expect(result).toStrictEqual({ status: 'refused', reason: 'too_many', position: null });
});

test('it refuses the first image over 5 MB by its position', async () => {
  const result = await readOwnerImages([
    new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])]),
    new Blob([new Uint8Array(5 * 1024 * 1024 + 1).fill(0xff)]),
  ]);

  expect(result).toStrictEqual({ status: 'refused', reason: 'too_large', position: 1 });
});

test('it refuses the first image whose bytes are no type it takes by its position', async () => {
  const result = await readOwnerImages([
    new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])]),
    new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])]),
    new Blob([new TextEncoder().encode('not an image')], { type: 'image/png' }),
  ]);

  expect(result).toStrictEqual({ status: 'refused', reason: 'unsupported_type', position: 2 });
});
