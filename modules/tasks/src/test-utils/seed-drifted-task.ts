import { withWriteTransaction } from '@heynixie/log';
import type { TasksContext, TasksTables } from '../types';

export async function seedDriftedTask(context: TasksContext, taskID: string): Promise<void> {
  // A tasks row whose step_errors disagrees with the records of its thread: the fold writes the two
  // together, so no code leaves them apart.
  await withWriteTransaction(context.log.writer, (tx) =>
    tx
      .$extendTables<TasksTables>()
      .updateTable('tasks')
      .set({ step_errors: 7 })
      .where('task_id', '=', taskID)
      .execute(),
  );
}
