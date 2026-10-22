import { expect, test } from 'bun:test';
import { readMemoryTmpdir } from './read-memory-tmpdir';

test('it reads /dev/shm as the temp directory when it is a tmpfs with 512 MiB free', () => {
  expect(readMemoryTmpdir(() => ({ type: 0x01_02_19_94, bavail: 131_072, bsize: 4096 }))).toBe(
    '/dev/shm',
  );
});

test.each([
  ['a tmpfs with less than 512 MiB free', { type: 0x01_02_19_94, bavail: 16_384, bsize: 4096 }],
  ['an ext4 filesystem', { type: 0xef_53, bavail: 1_048_576, bsize: 4096 }],
])('it reads no temp directory when /dev/shm is %s', (_label, stats) => {
  expect(readMemoryTmpdir(() => stats)).toBeNull();
});

test('it reads no temp directory when the host has no /dev/shm', () => {
  expect(
    readMemoryTmpdir(() => {
      throw Object.assign(new Error('ENOENT: no such file or directory'), { code: 'ENOENT' });
    }),
  ).toBeNull();
});
