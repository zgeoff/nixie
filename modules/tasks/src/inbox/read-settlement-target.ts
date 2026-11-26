import { isFinishedState } from '@heynixie/task-control';
import type { Transaction } from 'kysely';
import { readRunRows } from '../run/read-run-rows';
import type { TasksTables } from '../types';

export interface SettlementTarget {
  readonly thread: string;

  // the proposing task's ID, when it had closed and the settlement went to another thread
  readonly task: string | null;
}

// A closed task takes no input, so its settlement goes to the report target its latest task run
// pinned, else to its starter, and names the task by ID: its name is erasable in the log.
export async function readSettlementTarget(
  tx: Transaction<unknown>,
  thread: string,
): Promise<SettlementTarget> {
  const task = await tx
    .$extendTables<TasksTables>()
    .selectFrom('tasks')
    .select(['state', 'started_by'])
    .where('task_id', '=', thread)
    .executeTakeFirst();

  if (task === undefined || !isFinishedState(task.state)) {
    return { thread, task: null };
  }

  const runs = await readRunRows(tx, thread);

  const pinned = runs.findLast((run) => run.opened.report.target !== null)?.opened.report.target;
  const target = pinned ?? task.started_by;

  return target === null || target === undefined
    ? { thread, task: null }
    : { thread: target, task: thread };
}
