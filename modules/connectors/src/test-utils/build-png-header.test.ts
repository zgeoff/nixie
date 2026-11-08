import { expect, test } from 'bun:test';
import { buildPNGHeader } from './build-png-header';

test('it builds a PNG header that claims the size asked', () => {
  const header = buildPNGHeader({ width: 10_000, height: 8000 });

  expect(new Bun.Image(header).metadata()).resolves.toStrictEqual({
    width: 10_000,
    height: 8000,
    format: 'png',
  });
});
