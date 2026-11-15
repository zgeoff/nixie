import { expect, test } from 'bun:test';
import { formatCodeRunSize } from './format-code-run-size';

test.each([
  { bytes: 12, expected: '12 B' },
  { bytes: 1536, expected: '1.5 KiB' },
  { bytes: 20 * 1024 * 1024, expected: '20.0 MiB' },
])('it formats $bytes bytes as $expected', (row) => {
  expect(formatCodeRunSize(row.bytes)).toBe(row.expected);
});
