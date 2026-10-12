import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import type { TasksContext, TasksTables } from './types';

// Creates a system task under its fixed ID on first start and leaves it be on every start after.
// A system task, such as the memory writer, belongs to nixie rather than to a brief of yours, so it
// has no brief and starts ready for its first step.
export async function createSystemTask(
  context: Pick<TasksContext, 'definitions' | 'log'>,
  taskID: string,
): Promise<void> {
  await withWriteTransaction(context.log.writer, async (tx) => {
    const existing = await tx
      .$extendTables<TasksTables>()
      .selectFrom('tasks')
      .select('task_id')
      .where('task_id', '=', taskID)
      .executeTakeFirst();

    if (existing !== undefined) {
      return;
    }
    await writeRecordsInTransaction(tx, context.log, [
      {
        kind: 'task.created',
        definitions: context.definitions(),
        thread: taskID,
        payload: { taskID, isConversation: false, state: 'ready' },
      },
    ]);
  });
}
