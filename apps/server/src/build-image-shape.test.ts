import { expect, test } from 'bun:test';
import { z } from 'zod';
import { buildImageShape } from './build-image-shape';
import { releaseImagesSchema } from './release-images-schema';
import { sandboxImagesSchema } from './sandbox-images-schema';

function setupTest() {
  return { keys: ['conversation', 'fetch', 'extra'] } as const;
}

test('it refuses a key outside the tuple when each key is optional', () => {
  const ctx = setupTest();
  const schema = buildImageShape(ctx.keys, z.string(), 'optional');

  expect(schema.safeParse({ conversation: 'a', fetch: 'b', extra: 'c', other: 'd' }).success).toBe(
    false,
  );
});

test('it refuses a key outside the tuple when each key is required', () => {
  const ctx = setupTest();
  const schema = buildImageShape(ctx.keys, z.string(), 'required');

  expect(schema.safeParse({ conversation: 'a', fetch: 'b', extra: 'c', other: 'd' }).success).toBe(
    false,
  );
});

test('it accepts a missing key when each key is optional', () => {
  const ctx = setupTest();
  const schema = buildImageShape(ctx.keys, z.string(), 'optional');

  expect(schema.safeParse({ conversation: 'a' }).success).toBe(true);
});

test('it refuses a missing key when each key is required', () => {
  const ctx = setupTest();
  const schema = buildImageShape(ctx.keys, z.string(), 'required');

  expect(schema.safeParse({ conversation: 'a', fetch: 'b' }).success).toBe(false);
});

test('it refuses an unknown key in the printed sandbox images', () => {
  expect(sandboxImagesSchema.safeParse({ other: { name: 'a', ref: 'b' } }).success).toBe(false);
});

test('it refuses an unknown key in the sandbox images of release.json', () => {
  expect(
    releaseImagesSchema.safeParse({
      images: { server: 'a', web: 'b', backup: 'c' },
      sandboxImages: { conversation: 'd', fetch: 'e', other: 'f' },
    }).success,
  ).toBe(false);
});
