import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import type { TasksContext } from '@heynixie/tasks';
import { probeTaskPaused, requireLease, resetLease, waitAtFaultPoint } from '@heynixie/tasks';
import type { ActionRow, ActionsTables } from '../types';
import { buildCancelledCheck } from './build-cancelled-check';
import { buildHeldCheck } from './build-held-check';
import type { Attempt } from './leased-records';

export type AttemptStart = 'started' | 'barred' | 'past_deadline';

export interface AttemptStartOptions {
  // whether a barred attempt releases its lease; a step that holds the task's lease keeps it
  readonly resetWhenBarred: boolean;
}

export function isPastDeadline(action: Pick<ActionRow, 'deadline_at'>, now: number): boolean {
  return action.deadline_at !== null && now >= action.deadline_at;
}

// A stop, a pause, a close or a pause of all of nixie can commit, and the deadline can pass, while
// the policy check runs, so the start reads them again in its own transaction. An action past its
// deadline keeps its lease for the failure.
export async function writeAttemptStarted(
  context: TasksContext,
  attempt: Attempt,
  options: AttemptStartOptions,
): Promise<AttemptStart> {
  const start = await withWriteTransaction(
    context.log.writer,
    async (tx): Promise<AttemptStart> => {
      const now = context.clock.now();

      await requireLease(tx, attempt.lease, now);

      const action = await tx
        .$extendTables<ActionsTables>()
        .selectFrom('actions')
        .innerJoin('tasks', 'tasks.task_id', 'actions.task_id')
        .select((eb) => eb.or([buildCancelledCheck(eb), buildHeldCheck(eb)]).as('is_barred'))
        .select(['actions.held_by_proposal_id', 'actions.deadline_at'])
        .where('actions.action_id', '=', attempt.action.action_id)
        .executeTakeFirstOrThrow();

      const isPaused = await probeTaskPaused(tx, attempt.action.task_id);

      const isBarred = action.is_barred === 1 || action.is_barred === true;

      if (isBarred || isPaused || action.held_by_proposal_id !== null) {
        if (options.resetWhenBarred) {
          await resetLease(tx, attempt.lease);
        }

        return 'barred';
      }

      if (isPastDeadline(action, now)) {
        return 'past_deadline';
      }

      await writeRecordsInTransaction(tx, context.log, [
        {
          kind: 'action.attempt_started',
          definitions: context.definitions(),
          thread: attempt.action.task_id,
          payload: { actionID: attempt.action.action_id, attempt: attempt.attempt },
        },
      ]);

      return 'started';
    },
  );

  if (start === 'started' && NIXIE_TEST_BUILD) {
    await waitAtFaultPoint('attempt.record.after', {
      kind: 'action',
      id: attempt.action.action_id,
    });
  }

  return start;
}
