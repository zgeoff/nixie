import { expect, test } from 'bun:test';
import { pickMediaType } from './pick-media-type';

test.each([
  {
    name: 'PNG',
    bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0],
    expected: 'image/png',
  },
  { name: 'JPEG', bytes: [0xff, 0xd8, 0xff, 0xe0], expected: 'image/jpeg' },
  { name: 'GIF', bytes: [0x47, 0x49, 0x46, 0x38, 0x39, 0x61], expected: 'image/gif' },
  {
    name: 'WebP',
    bytes: [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50],
    expected: 'image/webp',
  },
])('it reads a $name from its bytes, whatever its extension', (row) => {
  expect(pickMediaType('out/file.dat', new Uint8Array(row.bytes))).toBe(row.expected);
});

test.each([
  { path: 'out/totals.csv', expected: 'text/csv' },
  { path: 'out/REPORT.PDF', expected: 'application/pdf' },
  { path: 'out/data.json', expected: 'application/json' },
  { path: 'out/archive.unknown', expected: 'application/octet-stream' },
  { path: 'out/noextension', expected: 'application/octet-stream' },
  { path: 'out/.hidden', expected: 'application/octet-stream' },
])('it reads $expected from the extension of $path', (row) => {
  expect(pickMediaType(row.path, new TextEncoder().encode('plain'))).toBe(row.expected);
});
