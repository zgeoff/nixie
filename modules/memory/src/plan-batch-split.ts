import type { BatchBounds } from './writer-types';

export interface SplitRecord {
  readonly sequence: number;
  readonly isOwner: boolean;
}

export function planBatchSplit(
  bounds: BatchBounds,
  records: readonly SplitRecord[],
): BatchBounds | null {
  const owners = records.filter((record) => record.isOwner);
  const middle = owners[Math.floor(owners.length / 2)];

  if (owners.length < 2 || middle === undefined) {
    return null;
  }

  const before = records.findLast((record) => record.sequence < middle.sequence);

  return { start: bounds.start, end: before?.sequence ?? bounds.start };
}
