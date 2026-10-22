import type { StatsFs } from 'node:fs';
import { statfsSync } from 'node:fs';

export type ReadFilesystemStats = (path: string) => Pick<StatsFs, 'type' | 'bavail' | 'bsize'>;

const MEMORY_TMPDIR = '/dev/shm';

// The statfs magic number of tmpfs, from Linux's magic.h.
const TMPFS_MAGIC = 0x01_02_19_94;

// A server suite's data directory and its sandboxes stay well under this, and Docker's default
// /dev/shm of 64 MiB falls short of it.
const MIN_FREE_BYTES = 512 * 1024 * 1024;

export function readMemoryTmpdir(readStats: ReadFilesystemStats = statfsSync): string | null {
  const stats = readStatsOrNull(readStats);

  if (stats === null || stats.type !== TMPFS_MAGIC || stats.bavail * stats.bsize < MIN_FREE_BYTES) {
    return null;
  }

  return MEMORY_TMPDIR;
}

function readStatsOrNull(readStats: ReadFilesystemStats) {
  try {
    return readStats(MEMORY_TMPDIR);
  } catch {
    return null;
  }
}
