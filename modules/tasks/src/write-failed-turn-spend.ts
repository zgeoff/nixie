import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import { requireLease } from './require-lease';
import { taskFailedTurnSpentCodec } from './task-failed-turn-spent-codec';
import type { Lease, TasksContext } from './types';

export interface FailedTurnSpend {
  readonly lease: Lease;
  readonly stepKey: string;
  readonly dollars: number;
}

// A failed turn commits no turn record, so this record is the only count of what its calls spent.
export async function writeFailedTurnSpend(
  context: Pick<TasksContext, 'clock' | 'definitions' | 'log'>,
  spend: FailedTurnSpend,
): Promise<void> {
  const taskID = spend.lease.workID;

  await withWriteTransaction(context.log.writer, async (tx) => {
    await requireLease(tx, spend.lease, context.clock.now());

    await writeRecordsInTransaction(tx, context.log, [
      {
        kind: taskFailedTurnSpentCodec.kind,
        definitions: context.definitions(),
        thread: taskID,
        payload: taskFailedTurnSpentCodec.encode({
          taskID,
          stepKey: spend.stepKey,
          dollars: spend.dollars,
        }),
      },
    ]);
  });
}
