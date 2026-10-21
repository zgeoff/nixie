import type { ImageTally } from './types';

export function mergeImageTallies(...tallies: readonly ImageTally[]): ImageTally {
  return tallies.reduce(
    (total, tally) => ({ bytes: total.bytes + tally.bytes, count: total.count + tally.count }),
    { bytes: 0, count: 0 },
  );
}
