import type { ReadFilesystemType } from './types';

// Throws unless the data directory sits on a local filesystem. The writer lock and SQLite's own
// locks hold only between processes on one kernel, and a network filesystem can let a second node
// write the same database.
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

// statfs magic numbers from Linux's magic.h and the filesystems that define their own
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
