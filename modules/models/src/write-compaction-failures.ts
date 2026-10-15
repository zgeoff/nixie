import type { RecordInput } from '@heynixie/log';
import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import { requireLease } from '@heynixie/tasks';
import type { SessionStep } from './types';

// Writes the compaction failures of a step that fails, while its lease stands, so the log keeps
// their cause and count after the step error drops the rest of the step.
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
