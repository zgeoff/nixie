import { expect, test } from 'bun:test';
import { buildNoisePNG } from './build-noise-png';

test('it builds a PNG of the size asked', () => {
  const png = buildNoisePNG({ width: 40, height: 30 });

  expect(new Bun.Image(png).metadata()).resolves.toStrictEqual({
    width: 40,
    height: 30,
    format: 'png',
  });
});

test('it builds a PNG whose pixels decode', () => {
  const png = buildNoisePNG({ width: 40, height: 30 });

  expect(new Bun.Image(png).png().bytes()).resolves.toBeInstanceOf(Uint8Array);
});

test('it builds a PNG whose bytes hold more than its raw pixels', () => {
  expect(buildNoisePNG({ width: 40, height: 30 }).byteLength).toBeGreaterThan(40 * 30 * 3);
});
