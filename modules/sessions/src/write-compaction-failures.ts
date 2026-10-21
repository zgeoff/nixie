import type { RecordInput } from '@heynixie/log';
import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import { requireLease } from '@heynixie/tasks';
import type { SessionStep } from './types';

export function writeCompactionFailures(
  step: SessionStep,
  records: readonly RecordInput[],
): Promise<void> {
  const context = step.run.context;

  return withWriteTransaction(context.log.writer, async (tx) => {
    await requireLease(tx, step.input.lease, context.clock.now());

    await writeRecordsInTransaction(
      tx,
      context.log,
      records.map((record) => ({ ...record, thread: step.input.taskID })),
    );
  });
}
