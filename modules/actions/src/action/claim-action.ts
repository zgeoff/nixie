import type { Lease, TasksContext } from '@heynixie/tasks';
import { buildPauseCheck, claimLease } from '@heynixie/tasks';
import { sql } from 'kysely';
import type { ActionsTables } from '../types';
import { buildCancelledCheck } from './build-cancelled-check';
import { buildHeldCheck } from './build-held-check';

export interface ClaimActionOptions {
  readonly holder: string;
  readonly leaseMs: number;
}

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
        .select(['actions.action_id', 'actions.task_id'])
        .where((eb) =>
          eb.or([
            eb.and([
              eb('actions.status', '=', 'pending'),
              eb('actions.next_attempt_at', '<=', now),
            ]),

            // an action whose outcome is unknown comes back for its read-only check
            eb.and([eb('actions.status', '=', 'unknown'), eb('actions.reconcile_at', '<=', now)]),
          ]),
        )
        .where('actions.held_by_proposal_id', 'is', null)

        // a task's step runs an action of a tool that runs inside the turn
        .where('actions.runs_in_step', '=', 0)
        .where((eb) => eb.not(buildCancelledCheck(eb)))
        .where((eb) => buildPauseCheck(eb, 'actions.task_id'))
        .where((eb) => eb.not(buildHeldCheck(eb)))
        .where((eb) => eb.or([eb('leases.holder', 'is', null), eb('leases.expires_at', '<=', now)]))
        .orderBy(sql`coalesce(actions.reconcile_at, actions.next_attempt_at)`)
        .limit(1)
        .executeTakeFirst();

      return row === undefined ? null : { workID: row.action_id, taskID: row.task_id };
    },
  });
}
