import type { ReadDiskStats } from '../check-disk';

type DiskStats = Awaited<ReturnType<ReadDiskStats>>;

// Makes a disk statistics reader that answers the block counts it is given for every path, in the
// fields that statfs reports them in.
export function makeStubDiskStats(stats: DiskStats): ReadDiskStats {
  return () => Promise.resolve({ blocks: stats.blocks, bavail: stats.bavail });
}
