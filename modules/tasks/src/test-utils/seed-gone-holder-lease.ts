import { withWriteTransaction } from '@heynixie/log';
import type { TasksContext, TasksTables } from '../types';

export async function seedGoneHolderLease(context: TasksContext, taskID: string): Promise<void> {
  // A lease that a holder of a later writer epoch left unexpired: a claim takes the epoch of the
  // writer that makes it, so no claim writes this row.
  await withWriteTransaction(context.log.writer, (tx) =>
    tx
      .$extendTables<TasksTables>()
      .updateTable('leases')
      .set({ holder: 'nixie-gone', expires_at: 9_000_000, epoch: 999 })
      .where('work_id', '=', taskID)
      .execute(),
  );
}
