import { expect, test } from 'bun:test';
import { readPNGSize } from './read-png-size';

test('it reads the size from the header of a PNG', async () => {
  const png = await new Bun.Image(
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
      'base64',
    ),
  )
    .resize(30, 20, { fit: 'fill' })
    .png()
    .bytes();

  expect(readPNGSize(png)).toStrictEqual({ width: 30, height: 20 });
});
