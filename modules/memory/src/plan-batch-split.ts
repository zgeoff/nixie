import type { BatchBounds } from './writer-types';

// One record inside a batch, as the split sees it.
export interface SplitRecord {
  readonly sequence: number;
  readonly isOwner: boolean;
}

// Plans the first half of a batch that went over its proposal cap: the batch ends before the
// message at the middle of your messages, so each half holds whole turns. A batch with one message
// of yours cannot split and returns null.
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
