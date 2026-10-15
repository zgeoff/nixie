import { statfs } from 'node:fs/promises';
import type { PartReport } from './types';

// The block counts of a filesystem, the part of statfs the disk check reads.
export type ReadDiskStats = (path: string) => Promise<{
  readonly blocks: number;
  readonly bavail: number;
}>;

// The disk part: ready while the data volume is under 90% full, counting the blocks an
// unprivileged process can no longer use as used.
export async function checkDisk(
  dataDir: string,
  readDiskStats: ReadDiskStats = statfs,
): Promise<PartReport> {
  const stats = await readDiskStats(dataDir);

  const percent = Math.floor(((stats.blocks - stats.bavail) / stats.blocks) * 100);

  return percent < fullPercent
    ? { isReady: true, reason: null }
    : { isReady: false, reason: `the data volume is ${percent}% full` };
}

const fullPercent = 90;
