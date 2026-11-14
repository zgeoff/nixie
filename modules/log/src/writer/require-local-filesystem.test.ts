import { expect, test } from 'bun:test';
import { requireLocalFilesystem } from './require-local-filesystem';

test.each([
  ['nfs', 0x69_69],
  ['cifs', 0xff_53_4d_42],
  ['smb2', 0xfe_53_4d_42],
  ['9p', 0x01_02_19_97],
])('it refuses a data directory that statfs reports on %s', (name, type) => {
  expect(() => {
    requireLocalFilesystem('/data', () => ({ type }));
  }).toThrowWithMessage(
    Error,
    `data directory /data is on a network filesystem (${name}), and nixie needs a local one`,
  );
});

test.each([
  ['ext4', 0xef_53],
  ['xfs', 0x58_46_53_42],
  ['btrfs', 0x91_23_68_3e],
  ['overlayfs', 0x79_4c_76_30],
])('it accepts a data directory on %s', (_, type) => {
  expect(() => {
    requireLocalFilesystem('/data', () => ({ type }));
  }).not.toThrow();
});
