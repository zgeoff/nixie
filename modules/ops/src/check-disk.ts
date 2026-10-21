import { statfs } from 'node:fs/promises';
import type { PartReport } from './types';

export type ReadDiskStats = (path: string) => Promise<{
  readonly blocks: number;
  readonly bavail: number;
}>;

const fullPercent = 90;

export async function checkDisk(
  dataDir: string,
  readDiskStats: ReadDiskStats = statfs,
): Promise<PartReport> {
  const stats = await readDiskStats(dataDir);

  // bavail leaves out the blocks that the filesystem reserves for root, so they count as used.
  const percent = Math.floor(((stats.blocks - stats.bavail) / stats.blocks) * 100);

  return percent < fullPercent
    ? { isReady: true, reason: null }
    : { isReady: false, reason: `the data volume is ${percent}% full` };
}
