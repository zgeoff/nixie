import type { PublishResult } from '../memory/write-memory-batch';
import type { CappedBatch } from '../proposal/plan-proposal-cap';
import { MemoryItemNotFoundError } from '../utils/error/memory-item-not-found-error';
import { StaleCheckerError } from '../utils/error/stale-checker-error';
import { StaleVersionError } from '../utils/error/stale-version-error';
import type { BatchBounds, StagedFlag, WriterUsage } from '../writer/writer-model';
import type { WriterParts, WriterStepState } from '../writer/writer-parts';
import { buildBatchRecords } from './build-batch-records';
import { pickBatchMode } from './pick-batch-mode';

export interface BatchToWrite extends WriterStepState {
  readonly bounds: BatchBounds;
  readonly capped: Extract<CappedBatch, { readonly kind: 'publish' }>;
  readonly flags: readonly StagedFlag[];
  readonly usage: WriterUsage | null;
}

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
      clock: parts.context.clock,
      bounds: batch.bounds,
      writes: batch.capped.writes,
      flags: batch.flags,
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
    if (
      error instanceof StaleVersionError ||
      error instanceof MemoryItemNotFoundError ||
      error instanceof StaleCheckerError
    ) {
      return { status: 'superseded' };
    }

    throw error;
  }
}
