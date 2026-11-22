import { expect, test } from 'bun:test';
import { buildDiskEntries } from './build-disk-entries';

test('it makes the profile readable by the Chromium account alone', () => {
  const entries = buildDiskEntries('/home/computer');

  expect(entries.find((entry) => entry.path === '/home/computer/profile')).toStrictEqual({
    path: '/home/computer/profile',
    uid: 1001,
    gid: 1001,
    mode: 0o700,
    isRecursive: true,
  });
});

test('it gives the files to the terminal account alone', () => {
  const entries = buildDiskEntries('/home/computer');

  expect(entries.find((entry) => entry.path === '/home/computer/files')).toStrictEqual({
    path: '/home/computer/files',
    uid: 1002,
    gid: 1002,
    mode: 0o700,
    isRecursive: true,
  });
});

test('it keeps the home with root and the sticky bit, so the terminal cannot replace the profile', () => {
  const entries = buildDiskEntries('/home/computer');

  expect(entries[0]).toStrictEqual({
    path: '/home/computer',
    uid: 0,
    gid: 1002,
    mode: 0o1775,
    isRecursive: false,
  });
});
