import type { TasksContext } from '@heynixie/tasks';
import invariant from 'tiny-invariant';
import { buildCancelledCheck } from './build-cancelled-check';
import type { ActionCounts, ActionsTables } from './types';

export async function readActionCounts(
  context: Pick<TasksContext, 'log'>,
  taskIDs: readonly string[],
): Promise<ReadonlyMap<string, ActionCounts>> {
  if (taskIDs.length === 0) {
    return new Map();
  }

  const rows = await context.log.writer.db
    .$extendTables<ActionsTables>()
    .selectFrom('actions')
    .select((eb) => ['task_id', 'attempt_count', buildCancelledCheck(eb).as('is_cancelled')])
    .where('task_id', 'in', taskIDs)
    .where((eb) => eb.or([eb('status', '=', 'pending'), buildCancelledCheck(eb)]))
    .execute();

  const counts = new Map(
    taskIDs.map((taskID): [string, ActionCounts] => [
      taskID,
      { queued: 0, started: 0, cancelled: 0 },
    ]),
  );

  for (const row of rows) {
    const count = counts.get(row.task_id);

    const key = pickCountKey(
      row.is_cancelled === 1 || row.is_cancelled === true,
      row.attempt_count,
    );

    invariant(count);

    counts.set(row.task_id, { ...count, [key]: count[key] + 1 });
  }

  return counts;
}

function pickCountKey(isCancelled: boolean, attemptCount: number): keyof ActionCounts {
  if (isCancelled) {
    return 'cancelled';
  }

  return attemptCount === 0 ? 'queued' : 'started';
}
