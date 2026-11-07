import { randomBytes } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { buildPNGChunk } from './build-png-chunk';
import type { TestImageSize } from './encode-test-image';

const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// Builds an RGB PNG of random pixels, which no encode can compress, so a test can reach the model's
// byte limit at a size it chooses.
export function buildNoisePNG(size: TestImageSize): Uint8Array {
  const header = Buffer.alloc(13);
  const rowBytes = size.width * 3 + 1;
  const rows = Buffer.alloc(rowBytes * size.height);

  header.writeUInt32BE(size.width, 0);
  header.writeUInt32BE(size.height, 4);
  header.set([8, 2, 0, 0, 0], 8);

  for (let row = 0; row < size.height; row += 1) {
    randomBytes(size.width * 3).copy(rows, row * rowBytes + 1);
  }

  return Buffer.concat([
    pngSignature,
    buildPNGChunk('IHDR', header),
    buildPNGChunk('IDAT', deflateSync(rows, { level: 0 })),
    buildPNGChunk('IEND', new Uint8Array()),
  ]);
}
