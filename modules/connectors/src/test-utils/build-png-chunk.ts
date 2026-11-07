import { crc32 } from 'node:zlib';

export function buildPNGChunk(type: string, data: Uint8Array): Buffer {
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const length = Buffer.alloc(4);
  const checksum = Buffer.alloc(4);

  length.writeUInt32BE(data.byteLength);
  checksum.writeUInt32BE(crc32(body));

  return Buffer.concat([length, body, checksum]);
}
