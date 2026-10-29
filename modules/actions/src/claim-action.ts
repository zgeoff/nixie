import type { Lease, TaskState, TasksContext } from '@heynixie/tasks';
import { claimLease } from '@heynixie/tasks';
import { sql } from 'kysely';
import type { ActionsTables } from './types';

export interface ClaimActionOptions {
  readonly holder: string;
  readonly leaseMs: number;
}

// An action with a started attempt runs to its outcome whatever its task's state, so only an action
// that never started waits for its task.
const heldTaskStates: readonly TaskState[] = ['paused', 'closed'];

export function claimAction(
  context: TasksContext,
  options: ClaimActionOptions,
): Promise<Lease | null> {
  return claimLease(context, {
    kind: 'action',
    holder: options.holder,
    durationMs: options.leaseMs,
    readCandidate: async (tx, now) => {
      const row = await tx
        .$extendTables<ActionsTables>()
        .selectFrom('actions')
        .leftJoin('leases', (join) =>
          join
            .on('leases.kind', '=', sql.lit('action'))
            .onRef('leases.work_id', '=', 'actions.action_id'),
        )
        .innerJoin('tasks', 'tasks.task_id', 'actions.task_id')
        .select('actions.action_id')
        .where('actions.status', '=', 'pending')
        .where('actions.next_attempt_at', '<=', now)
        .where((eb) =>
          eb.or([eb('actions.attempt_count', '>', 0), eb('tasks.state', 'not in', heldTaskStates)]),
        )
        .where((eb) => eb.or([eb('leases.holder', 'is', null), eb('leases.expires_at', '<=', now)]))
        .orderBy('actions.next_attempt_at')
        .limit(1)
        .executeTakeFirst();

      return row?.action_id ?? null;
    },
  });
}
