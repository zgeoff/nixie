import { expect, test } from 'bun:test';
import { pointTmpdirAtMemory } from './point-tmpdir-at-memory';

test('it points TMPDIR at /dev/shm when that is an executable tmpfs with room', () => {
  const env = { TMPDIR: '/var/tmp/harbour-tests' };

  pointTmpdirAtMemory(env, {
    readMounts: () => 'shm /dev/shm tmpfs rw,nosuid,nodev,relatime 0 0\n',
    readStats: () => ({ bavail: 1_048_576, bsize: 4096 }),
  });

  expect(env.TMPDIR).toBe('/dev/shm');
});

test('it keeps TMPDIR when /dev/shm is a noexec tmpfs', () => {
  const env = { TMPDIR: '/var/tmp/harbour-tests' };

  pointTmpdirAtMemory(env, {
    readMounts: () => 'shm /dev/shm tmpfs rw,nosuid,nodev,noexec,relatime 0 0\n',
    readStats: () => ({ bavail: 1_048_576, bsize: 4096 }),
  });

  expect(env.TMPDIR).toBe('/var/tmp/harbour-tests');
});
