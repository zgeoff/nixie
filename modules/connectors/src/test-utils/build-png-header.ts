import { buildPNGChunk } from './build-png-chunk';
import type { TestImageSize } from './encode-test-image';

const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// Builds the start of a PNG, its signature and header chunk with no pixel data, so a test can
// claim any canvas size in a few bytes.
export function buildPNGHeader(size: TestImageSize): Uint8Array {
  const header = Buffer.alloc(13);

  header.writeUInt32BE(size.width, 0);
  header.writeUInt32BE(size.height, 4);
  header.set([8, 6, 0, 0, 0], 8);

  return Buffer.concat([pngSignature, buildPNGChunk('IHDR', header)]);
}
