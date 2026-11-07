import { expect, test } from 'bun:test';
import { buildPNGChunk } from './build-png-chunk';

test('it builds a chunk of its length, its type, its data and the checksum of type and data', () => {
  expect(buildPNGChunk('IEND', new Uint8Array())).toStrictEqual(
    Buffer.from([0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]),
  );
});
