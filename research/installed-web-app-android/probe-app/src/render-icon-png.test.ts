import { expect, test } from 'bun:test';
import { inflateSync } from 'node:zlib';
import { renderIconPNG } from './render-icon-png.ts';

test('it renders a PNG of the asked size with a teal corner and a white ring', () => {
  const png = Buffer.from(renderIconPNG(192, 'launcher'));
  const pixels = inflateSync(png.subarray(41, 41 + png.readUInt32BE(33)));
  const rowLength = 1 + 192 * 4;
  // the ring's outer edge sits at 0.32 of the size from the centre, its inner edge at 0.2
  const ringPixel = 96 * rowLength + 1 + Math.round(96 + 192 * 0.26) * 4;

  expect(png.subarray(0, 8)).toStrictEqual(
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  );
  expect(png.toString('latin1', 12, 16)).toBe('IHDR');
  expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toStrictEqual([192, 192]);
  expect([...pixels.subarray(1, 5)]).toStrictEqual([15, 118, 110, 255]);
  expect([...pixels.subarray(ringPixel, ringPixel + 4)]).toStrictEqual([255, 255, 255, 255]);
});

test('it renders the badge with a transparent background', () => {
  const png = Buffer.from(renderIconPNG(96, 'badge'));
  const pixels = inflateSync(png.subarray(41, 41 + png.readUInt32BE(33)));

  expect([...pixels.subarray(1, 5)]).toStrictEqual([0, 0, 0, 0]);
});
