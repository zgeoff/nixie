import { crc32 } from 'node:zlib';
import type { TestImageSize } from './encode-test-image';

const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

// Builds the start of a PNG, its signature and header chunk with no pixel data, so a test can
// claim any canvas size in a few bytes.
export function buildPNGHeader(size: TestImageSize): Uint8Array {
  const chunk = Buffer.alloc(4 + 13);

  chunk.write('IHDR', 0, 'latin1');
  chunk.writeUInt32BE(size.width, 4);
  chunk.writeUInt32BE(size.height, 8);
  chunk.set([8, 6, 0, 0, 0], 12);

  const length = Buffer.alloc(4);
  const checksum = Buffer.alloc(4);

  length.writeUInt32BE(13);
  checksum.writeUInt32BE(crc32(chunk));

  return Buffer.concat([Buffer.from(signature), length, chunk, checksum]);
}
