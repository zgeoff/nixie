import { readRecords } from '@heynixie/log';
import type { TasksContext, TasksTables } from '../types';
import type { CallTaskOptions } from './call-task-options';
import { callRunnerKey, callTaskOptionsSchema } from './call-task-options';

// A call's task as its runner reads it, or null for a task that is no call's.
export async function readCallTask(
  context: Pick<TasksContext, 'log'>,
  taskID: string,
): Promise<CallTaskOptions | null> {
  const row = await context.log.writer.db
    .$extendTables<TasksTables>()
    .selectFrom('tasks')
    .select('created_sequence')
    .where('task_id', '=', taskID)
    .executeTakeFirst();

  if (row === undefined) {
    return null;
  }

  const [created] = await readRecords(context.log, {
    afterSequence: 0,
    sequences: [row.created_sequence],
  });

  const payload = created?.record.payload;
  const options = callTaskOptionsSchema.safeParse(payload?.['runnerOptions']);

  return payload?.['runner'] === callRunnerKey && options.success ? options.data : null;
}
