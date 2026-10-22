import type { StatsFs } from 'node:fs';
import { readFileSync, statfsSync } from 'node:fs';

export interface MemoryTmpdirReads {
  readonly readMounts: () => string;

  readonly readStats: (path: string) => Pick<StatsFs, 'bavail' | 'bsize'>;
}

const MEMORY_TMPDIR = '/dev/shm';

// A server suite's data directory and its sandboxes stay well under this, and Docker's default
// /dev/shm of 64 MiB falls short of it.
const MIN_FREE_BYTES = 512 * 1024 * 1024;

const hostReads: MemoryTmpdirReads = {
  readMounts: () => readFileSync('/proc/self/mounts', 'utf8'),
  readStats: statfsSync,
};

// A server suite runs an executable stub that it writes under its temp directory, so a noexec
// mount, common for /dev/shm, would refuse to start it.
export function readMemoryTmpdir(reads: MemoryTmpdirReads = hostReads): string | null {
  try {
    const options = findTmpfsOptions(reads.readMounts());
    const stats = reads.readStats(MEMORY_TMPDIR);

    if (
      options === null ||
      options.includes('noexec') ||
      stats.bavail * stats.bsize < MIN_FREE_BYTES
    ) {
      return null;
    }

    return MEMORY_TMPDIR;
  } catch {
    return null;
  }
}

function findTmpfsOptions(mounts: string): readonly string[] | null {
  const fields = mounts
    .split('\n')
    .map((line) => line.split(' '))
    .findLast((line) => line[1] === MEMORY_TMPDIR);

  return fields?.[2] === 'tmpfs' ? (fields[3] ?? '').split(',') : null;
}
