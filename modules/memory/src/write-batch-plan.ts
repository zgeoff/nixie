import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import { requireLease, waitAtFaultPoint } from '@heynixie/tasks';
import { memoryWriterTaskID } from './memory-writer-task-id';
import type { BatchBounds, BatchMode } from './writer-model';
import type { WriterParts, WriterStepState } from './writer-parts';

export interface BatchPlanRecord extends Pick<WriterStepState, 'input' | 'now'> {
  readonly bounds: BatchBounds;
  readonly mode: BatchMode;
}

export async function writeBatchPlan(
  parts: Pick<WriterParts, 'context'>,
  plan: BatchPlanRecord,
): Promise<void> {
  const context = parts.context;

  await withWriteTransaction(context.log.writer, async (tx) => {
    await requireLease(tx, plan.input.lease, context.clock.now());

    await writeRecordsInTransaction(tx, context.log, [
      {
        kind: 'memory.batch_planned',
        definitions: context.definitions(),
        thread: memoryWriterTaskID,
        payload: { ...plan.bounds, mode: plan.mode, at: plan.now },
      },
    ]);
  });

  if (NIXIE_TEST_BUILD) {
    await waitAtFaultPoint('writer.batch.planned', { kind: 'task', id: memoryWriterTaskID });
  }
}
