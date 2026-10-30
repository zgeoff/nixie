import { deflateSync } from 'node:zlib';
import { concatBytes } from './concat-bytes.ts';

// Draws the app icon in code, so the repo holds no image file: a white ring on a teal square for
// the launcher, or a white ring on transparency for the notification badge, which Android masks to
// a silhouette.
export function renderIconPNG(size: number, kind: 'launcher' | 'badge'): Uint8Array<ArrayBuffer> {
  const rowLength = 1 + size * 4;
  const pixels = new Uint8Array(rowLength * size);
  const centre = size / 2;
  const outer = size * 0.32;
  const inner = size * 0.2;

  for (let row = 0; row < size; row++) {
    for (let column = 0; column < size; column++) {
      const distance = Math.hypot(column + 0.5 - centre, row + 0.5 - centre);
      const inRing = distance <= outer && distance >= inner;
      const offset = row * rowLength + 1 + column * 4;
      const colour = inRing
        ? [255, 255, 255, 255]
        : kind === 'launcher'
          ? [15, 118, 110, 255]
          : [0, 0, 0, 0];

      pixels.set(colour, offset);
    }
  }

  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);

  view.setUint32(0, size);
  view.setUint32(4, size);
  // 8 bits per channel, colour type 6 (RGBA)
  header.set([8, 6, 0, 0, 0], 8);

  return concatBytes(
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    buildChunk('IHDR', header),
    buildChunk('IDAT', deflateSync(pixels)),
    buildChunk('IEND', new Uint8Array()),
  );
}

function buildChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  const chunk = new Uint8Array(12 + data.length);
  const view = new DataView(chunk.buffer);

  view.setUint32(0, data.length);
  chunk.set(typeBytes, 4);
  chunk.set(data, 8);
  view.setUint32(8 + data.length, Bun.hash.crc32(chunk.subarray(4, 8 + data.length)));

  return chunk;
}
