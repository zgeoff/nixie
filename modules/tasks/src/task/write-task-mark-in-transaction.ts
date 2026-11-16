import { writeRecordsInTransaction } from '@heynixie/log';
import type { Transaction } from 'kysely';
import type { TaskState, TasksContext, TasksTables } from '../types';
import { taskMarkSetCodec } from './codec/task-mark-set-codec';
import { readTaskMark } from './read-task-mark';

export interface TaskMarkRequest {
  readonly taskID: string;
  readonly disposable: boolean;
}

export type TaskMarkOutcome =
  | { readonly status: 'set' }
  | { readonly status: 'unknown_task' }
  | { readonly status: 'no_mark' }
  | { readonly status: 'state_refused'; readonly state: TaskState };

// Changing the mark never closes a task, even one that already ended. The caller holds the write
// transaction, so the check of the task and the record that changes its mark commit together.
export async function writeTaskMarkInTransaction(
  tx: Transaction<unknown>,
  context: Pick<TasksContext, 'definitions' | 'log'>,
  request: TaskMarkRequest,
): Promise<TaskMarkOutcome> {
  const task = await tx
    .$extendTables<TasksTables>()
    .selectFrom('tasks')
    .select('state')
    .where('task_id', '=', request.taskID)
    .executeTakeFirst();

  if (task === undefined) {
    return { status: 'unknown_task' };
  }

  if ((await readTaskMark(tx, request.taskID)) === null) {
    return { status: 'no_mark' };
  }

  if (task.state === 'closed' || task.state === 'done') {
    return { status: 'state_refused', state: task.state };
  }

  await writeRecordsInTransaction(tx, context.log, [
    {
      kind: 'task.mark_set',
      definitions: context.definitions(),
      thread: request.taskID,
      payload: taskMarkSetCodec.encode(request),
    },
  ]);

  return { status: 'set' };
}
