import { buildBatchRecords } from './build-batch-records';
import { MemoryItemNotFoundError } from './memory-item-not-found-error';
import { pickBatchMode } from './pick-batch-mode';
import type { CappedBatch } from './plan-proposal-cap';
import { StaleVersionError } from './stale-version-error';
import type { PublishResult } from './write-memory-batch';
import type { WriterParts, WriterStepState } from './writer-parts';
import type { BatchBounds, WriterUsage } from './writer-types';

export interface BatchToWrite extends WriterStepState {
  readonly bounds: BatchBounds;
  readonly capped: Extract<CappedBatch, { readonly kind: 'publish' }>;
  readonly usage: WriterUsage | null;
}

// Publishes the batch, with a stale revision captured as a superseded batch: an item that moved on
// or was forgotten since the session read it fails the publish, and the next step
// extracts the batch again.
export async function tryWriteBatch(
  parts: WriterParts,
  batch: BatchToWrite,
): Promise<PublishResult> {
  const mode = pickBatchMode(batch.row, batch.bounds);
  const catchUpEnded =
    batch.row.caught_up_sequence === null && batch.bounds.end >= batch.row.start_sequence;

  try {
    return await parts.publish({
      lease: batch.input.lease,
      now: parts.context.clock.now(),
      bounds: batch.bounds,
      writes: batch.capped.writes,
      buildRecords: (outcome) =>
        buildBatchRecords(parts, {
          row: batch.row,
          now: batch.now,
          bounds: batch.bounds,
          mode,
          catchUpEnded,
          dropped: batch.capped.dropped,
          usage: batch.usage,
          outcome,
        }),
    });
  } catch (error) {
    if (error instanceof StaleVersionError || error instanceof MemoryItemNotFoundError) {
      return { status: 'superseded' };
    }
    throw error;
  }
}
