import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import { taskCreatedCodec } from './task-created-codec';
import type { TasksContext, TasksTables } from './types';

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
        payload: taskCreatedCodec.encode({ taskID, isConversation: false, state: 'ready' }),
      },
    ]);
  });
}
