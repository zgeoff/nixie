import type { ReadFilesystemType } from './types';

// The statfs magic numbers come from Linux's magic.h and from the filesystems that define their own.
const NETWORK_FILESYSTEMS = new Map([
  [0x69_69, 'nfs'],
  [0x51_7b, 'smb'],
  [0xff_53_4d_42, 'cifs'],
  [0xfe_53_4d_42, 'smb2'],
  [0x56_4c, 'ncp'],
  [0x73_75_72_45, 'coda'],
  [0x53_46_41_4f, 'afs'],
  [0x6b_41_46_53, 'afs'],
  [0x00_c3_64_00, 'ceph'],
  [0x01_02_19_97, '9p'],
  [0x0b_d0_0b_d0, 'lustre'],
  [0x01_16_19_70, 'gfs2'],
  [0x74_61_63_6f, 'ocfs2'],
]);

// flock and SQLite's locks hold only between processes on one kernel, so a network filesystem can
// let a second node write the same database.
export function requireLocalFilesystem(
  dataDir: string,
  readFilesystemType: ReadFilesystemType,
): void {
  const name = NETWORK_FILESYSTEMS.get(readFilesystemType(dataDir).type);

  if (name !== undefined) {
    throw new Error(
      `data directory ${dataDir} is on a network filesystem (${name}), and nixie needs a local one`,
    );
  }
}
