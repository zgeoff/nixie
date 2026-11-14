import { parseJSONObject } from '@heynixie/log';
import type { TaskState, TasksContext, TasksTables } from '../types';
import { isWakingRecord } from '../utils/is-waking-record';
import { readOpenRun } from './read-open-run';
import type { RunPhase, RunState } from './types';

// The projection has a row only from the claim, so a task run that waits for its claim reads as
// pending from the task's unread waking input.
export async function readRunState(
  context: Pick<TasksContext, 'log'>,
  taskID: string,
): Promise<RunState> {
  const db = context.log.writer.db;

  const run = await readOpenRun(db, taskID);

  const tasks = db.$extendTables<TasksTables>();

  const task = await tasks
    .selectFrom('tasks')
    .select(['state', 'read_cursor'])
    .where('task_id', '=', taskID)
    .executeTakeFirst();

  if (task === undefined) {
    return { kind: 'none' };
  }

  if (run !== null) {
    const wait = await tasks
      .selectFrom('task_messages')
      .select('message_id')
      .where('from_task', '=', taskID)
      .where('wait_state', '=', 'open')
      .limit(1)
      .executeTakeFirst();

    return { kind: 'open', run, phase: pickRunPhase(wait !== undefined, task.state) };
  }

  const unread = await tasks
    .selectFrom('records')
    .select(['kind', 'thread', 'payload'])
    .where('thread', '=', taskID)
    .where('sequence', '>', task.read_cursor)
    .execute();

  const isPending = unread.some((record) =>
    isWakingRecord({ ...record, payload: parseJSONObject(record.payload) }),
  );

  return { kind: isPending ? 'pending' : 'none' };
}

function pickRunPhase(hasOpenWait: boolean, state: TaskState): RunPhase {
  if (hasOpenWait) {
    return 'waiting_reply';
  }

  return state === 'waiting' ? 'idle' : 'active';
}
