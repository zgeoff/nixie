import { parseJSONObject } from '@heynixie/log';
import type { Transaction } from 'kysely';
import { taskCreatedCodec } from '../task/codec/task-created-codec';
import type { TaskRunOptions, TasksTables } from '../types';

export interface RunSetup {
  readonly startedBy: string;
  readonly options: TaskRunOptions;
}

// A task that has no options, or whose starter is gone from its row, has no setup: nixie opens no
// task run for it.
export async function readRunSetup(
  tx: Transaction<unknown>,
  taskID: string,
): Promise<RunSetup | null> {
  const db = tx.$extendTables<TasksTables>();

  const task = await db
    .selectFrom('tasks')
    .innerJoin('records', 'records.sequence', 'tasks.created_sequence')
    .select(['tasks.started_by', 'records.payload'])
    .where('tasks.task_id', '=', taskID)
    .executeTakeFirst();

  if (task === undefined || task.started_by === null) {
    return null;
  }

  const options = taskCreatedCodec.decode(parseJSONObject(task.payload)).options;

  return options === undefined ? null : { startedBy: task.started_by, options };
}
