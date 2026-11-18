import { expect, test } from 'bun:test';
import { formatFileSize } from './format-file-size';

test.each([
  [0, '0 B'],
  [812, '812 B'],
  [1024, '1.0 KiB'],
  [48_213, '47.1 KiB'],
  [1_048_576, '1.0 MiB'],
  [20 * 1_048_576, '20.0 MiB'],
])('it formats %d bytes as %s', (bytes, expected) => {
  expect(formatFileSize(bytes)).toBe(expected);
});
