import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import { requireLease, waitAtFaultPoint } from '@heynixie/tasks';
import type { TasksContext } from '@heynixie/tasks';
import type { Transaction } from 'kysely';
import { buildCancelledCheck } from './build-cancelled-check';
import type { ActionRow, ActionStatus, ActionsTables, AllowedCall } from './types';

export interface QueuedAction {
  readonly actionID: string;
  readonly status: ActionStatus;

  readonly isRepeat: boolean;
}

export async function createAllowedAction(
  context: TasksContext,
  call: AllowedCall,
): Promise<QueuedAction> {
  if (call.decision.outcome !== 'allow') {
    throw new Error(`a call the decision point answered ${call.decision.outcome} queues nothing`);
  }

  const taskID = call.step.lease.workID;

  if (NIXIE_TEST_BUILD) {
    await waitAtFaultPoint('queue.commit.before', { kind: 'task', id: taskID });
  }

  const queued = await withWriteTransaction(context.log.writer, async (tx) => {
    await requireLease(tx, call.step.lease, context.clock.now());

    const earlier = await readRepeat(tx, call);

    if (earlier !== undefined) {
      return { actionID: earlier.action_id, status: earlier.status, isRepeat: true };
    }

    const actionID = crypto.randomUUID();

    await writeRecordsInTransaction(tx, context.log, [
      {
        kind: 'action.queued',
        definitions: context.definitions(),
        thread: taskID,
        decision: call.decision,
        payload: {
          actionID,
          taskID,
          stepKey: call.step.stepKey,
          tool: call.tool,
          actionHash: call.actionHash,
          nextAttemptAt: context.clock.now(),
        },
        erasable: { arguments: call.arguments },
      },
    ]);

    return { actionID, status: 'pending' as const, isRepeat: false };
  });

  if (NIXIE_TEST_BUILD && !queued.isRepeat) {
    await waitAtFaultPoint('queue.commit.after', { kind: 'action', id: queued.actionID });
  }

  return queued;
}

function readRepeat(
  tx: Transaction<unknown>,
  call: AllowedCall,
): Promise<Pick<ActionRow, 'action_id' | 'status'> | undefined> {
  return tx
    .$extendTables<ActionsTables>()
    .selectFrom('actions')
    .select(['action_id', 'status'])
    .where('task_id', '=', call.step.lease.workID)
    .where('action_hash', '=', call.actionHash)
    .where((eb) => {
      const isLive = eb.not(buildCancelledCheck(eb));
      const isOpen = eb.and([eb('status', 'in', ['pending', 'unknown']), isLive]);

      return eb.or([eb('step_key', '=', call.step.stepKey), isOpen]);
    })
    .orderBy('queued_sequence', 'desc')
    .limit(1)
    .executeTakeFirst();
}
