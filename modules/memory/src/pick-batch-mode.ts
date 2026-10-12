import type { BatchBounds, BatchMode, WriterRow } from './writer-types';

// A batch that starts before the sequence at which memory started is a catch-up batch.
export function pickBatchMode(
  row: Pick<WriterRow, 'start_sequence'>,
  bounds: BatchBounds,
): BatchMode {
  return bounds.start < row.start_sequence ? 'catch_up' : 'live';
}
