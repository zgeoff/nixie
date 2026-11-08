import { expect, test } from 'bun:test';
import { encodeTestImage } from './encode-test-image';

test.each(['png', 'jpeg', 'webp'] as const)('it encodes a %s of the size asked', async (format) => {
  const bytes = await encodeTestImage({ width: 40, height: 30 }, format);

  expect(new Bun.Image(bytes).metadata()).resolves.toStrictEqual({ width: 40, height: 30, format });
});
