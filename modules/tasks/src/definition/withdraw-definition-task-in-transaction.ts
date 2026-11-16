import { writeRecordsInTransaction } from '@heynixie/log';
import type { Transaction } from 'kysely';
import { taskDefinitionSetCodec } from '../task/codec/task-definition-set-codec';
import type { TasksContext, TasksTables } from '../types';

// Puts a spent one-shot definition out of force: a null hash on its task, when the task holds a
// hash. A definition with no task, or a task that holds none, gets no record.
export async function withdrawDefinitionTaskInTransaction(
  tx: Transaction<unknown>,
  context: Pick<TasksContext, 'definitions' | 'log'>,
  definitionID: string,
): Promise<void> {
  const row = await tx
    .$extendTables<TasksTables>()
    .selectFrom('tasks')
    .select(['task_id', 'definition_hash'])
    .where('definition_id', '=', definitionID)
    .executeTakeFirst();

  if (row === undefined || row.definition_hash === null) {
    return;
  }

  await writeRecordsInTransaction(tx, context.log, [
    {
      kind: 'task.definition_set',
      definitions: context.definitions(),
      thread: row.task_id,
      payload: taskDefinitionSetCodec.encode({
        taskID: row.task_id,
        definitionID,
        definitionHash: null,
      }),
    },
  ]);
}
