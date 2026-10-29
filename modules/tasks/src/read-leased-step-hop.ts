import type { Transaction } from 'kysely';
import type { StepRunRef } from './parse-step-run-id';
import type { TasksTables } from './types';

// The write transaction opens with BEGIN IMMEDIATE, so this check holds against every claim until
// the caller's write commits.
export async function readLeasedStepHop(
  tx: Transaction<unknown>,
  taskID: string,
  step: StepRunRef,
  now: number,
): Promise<number | null> {
  const row = await tx
    .$extendTables<TasksTables>()
    .selectFrom('tasks')
    .innerJoin('leases', (join) =>
      join.onRef('leases.work_id', '=', 'tasks.task_id').on('leases.kind', '=', 'task'),
    )
    .select('tasks.step_hop')
    .where('tasks.task_id', '=', taskID)
    .where('tasks.started_step_key', '=', step.stepKey)
    .where('leases.generation', '=', step.generation)
    .where('leases.expires_at', '>', now)
    .executeTakeFirst();

  return row?.step_hop ?? null;
}
