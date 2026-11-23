import type { TasksContext, TasksTables } from '../types';

export interface RunningStep {
  readonly stepKey: string;

  // the lease's claim count: a rerun or a takeover of the same step key claims a new one
  readonly generation: number;
}

// null when no step of the task runs, when the task does not exist, or when the step's lease has
// expired: a step that lost its lease can no longer commit.
export async function readRunningStep(
  context: Pick<TasksContext, 'log' | 'clock'>,
  taskID: string,
): Promise<RunningStep | null> {
  const row = await context.log.writer.db
    .$extendTables<TasksTables>()
    .selectFrom('tasks')
    .innerJoin('leases', (join) =>
      join
        .onRef('leases.work_id', '=', 'tasks.task_id')
        .on('leases.kind', '=', 'task')
        .on('leases.holder', 'is not', null)
        .on('leases.expires_at', '>', context.clock.now()),
    )
    .select(['tasks.started_step_key', 'leases.generation'])
    .where('tasks.task_id', '=', taskID)
    .where('tasks.started_step_key', 'is not', null)
    .executeTakeFirst();

  return row === undefined || row.started_step_key === null
    ? null
    : { stepKey: row.started_step_key, generation: row.generation };
}
