import { countBatchTokens } from './count-batch-tokens';
import { planWriterBatch } from './plan-writer-batch';
import { readWriterBacklog } from './read-writer-backlog';
import { writeBatchPlan } from './write-batch-plan';
import type { WriterParts, WriterStepState } from './writer-parts';
import type { BatchBounds } from './writer-types';

export async function readBatchBounds(
  parts: WriterParts,
  state: WriterStepState,
): Promise<BatchBounds | { readonly wakeAt: number | null }> {
  const row = state.row;

  if (row.pending_start !== null && row.pending_end !== null) {
    return { start: row.pending_start, end: row.pending_end };
  }

  const backlog = await readWriterBacklog(parts.context.log, {
    after: row.cursor,
    ownerLimit: parts.config.batchMessages,
    through: null,
  });

  const plan = planWriterBatch({
    cursor: row.cursor,
    startSequence: row.start_sequence,
    messages: backlog.map((entry) => ({
      sequence: entry.sequence,
      isOwner: entry.role === 'owner',
      tokens: countBatchTokens(entry.text ?? ''),
      arrivedAt: entry.arrivedAt,
    })),
    now: state.now,
    lastBatchAt: row.last_batch_at,
    config: parts.config,
  });

  if (plan.kind === 'wait') {
    return { wakeAt: plan.wakeAt };
  }

  await writeBatchPlan(parts, { ...state, bounds: plan.bounds, mode: plan.mode });

  return plan.bounds;
}
