import { readRecords } from '@heynixie/log';
import { readLimitRecords } from './read-limit-records';
import { taskCreatedCodec } from './task-created-codec';
import type { TaskLimits, TaskRunOptions, TasksContext, TasksTables } from './types';

export interface TaskSetup {
  readonly startedBy: string;

  // A task that the user started by moving a message to it holds none.
  readonly options: TaskRunOptions | null;

  readonly limits: TaskLimits | null;
}

export async function readTaskSetup(
  context: Pick<TasksContext, 'log'>,
  taskID: string,
): Promise<TaskSetup | null> {
  const db = context.log.writer.db;

  const row = await db
    .$extendTables<TasksTables>()
    .selectFrom('tasks')
    .select(['started_by', 'created_sequence'])
    .where('task_id', '=', taskID)
    .executeTakeFirst();

  if (row === undefined || row.started_by === null) {
    return null;
  }

  const [created] = await readRecords(context.log, {
    afterSequence: 0,
    sequences: [row.created_sequence],
  });

  const options =
    created === undefined
      ? null
      : (taskCreatedCodec.decode(created.record.payload).options ?? null);

  const limitRecords = await readLimitRecords(db, taskID);

  return {
    startedBy: row.started_by,
    options,
    limits: limitRecords.raised ?? options?.limits ?? null,
  };
}
