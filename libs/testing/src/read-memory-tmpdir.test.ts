import { expect, test } from 'bun:test';
import { readMemoryTmpdir } from './read-memory-tmpdir';

test('it reads /dev/shm as the temp directory when it is an executable tmpfs with 512 MiB free', () => {
  expect(
    readMemoryTmpdir({
      readMounts: () =>
        '/dev/vda / ext4 rw,relatime 0 0\nshm /dev/shm tmpfs rw,nosuid,nodev,relatime 0 0\n',
      readStats: () => ({ bavail: 131_072, bsize: 4096 }),
    }),
  ).toBe('/dev/shm');
});

test.each([
  [
    'a noexec tmpfs',
    'shm /dev/shm tmpfs rw,nosuid,nodev,noexec,relatime 0 0\n',
    { bavail: 1_048_576, bsize: 4096 },
  ],
  [
    'a tmpfs with less than 512 MiB free',
    'shm /dev/shm tmpfs rw,nosuid,nodev,relatime 0 0\n',
    { bavail: 16_384, bsize: 4096 },
  ],
  [
    'an ext4 filesystem',
    '/dev/vdb /dev/shm ext4 rw,relatime 0 0\n',
    { bavail: 1_048_576, bsize: 4096 },
  ],
  ['not mounted', '/dev/vda / ext4 rw,relatime 0 0\n', { bavail: 1_048_576, bsize: 4096 }],
])('it reads no temp directory when /dev/shm is %s', (_label, mounts, stats) => {
  expect(readMemoryTmpdir({ readMounts: () => mounts, readStats: () => stats })).toBeNull();
});

test('it reads no temp directory on a host without /proc/self/mounts', () => {
  expect(
    readMemoryTmpdir({
      readMounts: () => {
        throw Object.assign(new Error('ENOENT: no such file or directory'), { code: 'ENOENT' });
      },
      readStats: () => ({ bavail: 1_048_576, bsize: 4096 }),
    }),
  ).toBeNull();
});
