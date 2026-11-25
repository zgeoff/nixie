import type { Log } from '@heynixie/log';
import { conversationTaskID, isFinishedState } from '@heynixie/tasks';
import type { TasksTables } from '@heynixie/tasks';
import type { WakeTarget } from '@heynixie/triggers';

export type WakeTargetResolution =
  | { readonly status: 'resolved'; readonly target: WakeTarget }
  | { readonly status: 'refused'; readonly message: string };

// The conversation or the task that a rule wakes. A call that names none takes the caller. A task
// that has ended is refused, as is one that never existed.
export async function resolveWakeTarget(
  log: Pick<Log, 'writer'>,
  caller: string,
  wake: string | undefined,
): Promise<WakeTargetResolution> {
  const named = wake ?? (caller === conversationTaskID ? 'conversation' : caller);

  if (named === 'conversation') {
    return { status: 'resolved', target: { kind: 'conversation' } };
  }

  const task = await log.writer.db
    .$extendTables<TasksTables>()
    .selectFrom('tasks')
    .select('state')
    .where('task_id', '=', named)
    .where('is_conversation', '=', 0)
    .executeTakeFirst();

  if (task === undefined || isFinishedState(task.state)) {
    return {
      status: 'refused',
      message: `UNKNOWN_TASK: no task that has not ended has the ID ${named}`,
    };
  }

  return { status: 'resolved', target: { kind: 'task', taskID: named } };
}
