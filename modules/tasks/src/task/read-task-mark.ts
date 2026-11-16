import { parseJSONObject } from '@heynixie/log';
import type { Kysely } from 'kysely';
import type { TasksTables } from '../types';
import { taskCreatedCodec } from './codec/task-created-codec';
import { taskMarkSetCodec } from './codec/task-mark-set-codec';

export interface TaskMark {
  readonly disposable: boolean;
}

// The mark of a started task: its creation record's, then the newest change of the owner's. A task
// that no start made has no mark, and a creation record with no mark reads as kept. The caller
// passes its write transaction when it acts on the answer.
export async function readTaskMark(db: Kysely<unknown>, taskID: string): Promise<TaskMark | null> {
  const tables = db.$extendTables<TasksTables>();

  const task = await tables
    .selectFrom('tasks')
    .innerJoin('records', 'records.sequence', 'tasks.created_sequence')
    .select(['tasks.started_by', 'records.payload'])
    .where('tasks.task_id', '=', taskID)
    .executeTakeFirst();

  if (task === undefined || task.started_by === null) {
    return null;
  }

  const change = await tables
    .selectFrom('records')
    .select('payload')
    .where('thread', '=', taskID)
    .where('kind', '=', 'task.mark_set')
    .orderBy('sequence', 'desc')
    .limit(1)
    .executeTakeFirst();

  if (change !== undefined) {
    return { disposable: taskMarkSetCodec.decode(parseJSONObject(change.payload)).disposable };
  }

  const created = taskCreatedCodec.decode(parseJSONObject(task.payload));

  return { disposable: created.disposable ?? false };
}
