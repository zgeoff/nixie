import type { ReadDiskStats } from '../check-disk';

type DiskStats = Awaited<ReturnType<ReadDiskStats>>;

export function makeStubDiskStats(stats: DiskStats): ReadDiskStats {
  return () => Promise.resolve({ blocks: stats.blocks, bavail: stats.bavail });
}
