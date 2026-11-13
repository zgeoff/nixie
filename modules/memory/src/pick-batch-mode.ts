import type { BatchBounds, BatchMode, WriterRow } from './writer-model';

export function pickBatchMode(
  row: Pick<WriterRow, 'start_sequence'>,
  bounds: BatchBounds,
): BatchMode {
  return bounds.start < row.start_sequence ? 'catch_up' : 'live';
}
