import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import { waitAtFaultPoint } from '@heynixie/tasks';
import type { TasksContext } from '@heynixie/tasks';
import type { Transaction } from 'kysely';
import type { ActionRow, ActionStatus, ActionsTables, AllowedCall } from './types';

export interface QueuedAction {
  readonly actionID: string;
  readonly status: ActionStatus;

  // true when the call matched an earlier action, whose status this is, and queued nothing
  readonly isRepeat: boolean;
}

// Queues an allowed call as an action under a new ID, its queue key and idempotency key. A repeat
// call with the same action hash, under the same step key or while an earlier action of the task is
// pending or unknown, returns that action's status instead, so a rerun never queues twice.
export async function createAllowedAction(
  context: TasksContext,
  call: AllowedCall,
): Promise<QueuedAction> {
  if (call.decision.outcome !== 'allow') {
    throw new Error(`a call the decision point answered ${call.decision.outcome} queues nothing`);
  }
  if (NIXIE_TEST_BUILD) {
    await waitAtFaultPoint('queue.commit.before', { kind: 'task', id: call.taskID });
  }
  const queued = await withWriteTransaction(context.log.writer, async (tx) => {
    const earlier = await findRepeat(tx, call);

    if (earlier !== undefined) {
      return { actionID: earlier.action_id, status: earlier.status, isRepeat: true };
    }
    const actionID = crypto.randomUUID();

    await writeRecordsInTransaction(tx, context.log, [
      {
        kind: 'action.queued',
        definitions: context.definitions(),
        thread: call.taskID,
        decision: call.decision,
        payload: {
          actionID,
          taskID: call.taskID,
          stepKey: call.stepKey,
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

function findRepeat(
  tx: Transaction<unknown>,
  call: AllowedCall,
): Promise<Pick<ActionRow, 'action_id' | 'status'> | undefined> {
  return tx
    .$extendTables<ActionsTables>()
    .selectFrom('actions')
    .select(['action_id', 'status'])
    .where('task_id', '=', call.taskID)
    .where('action_hash', '=', call.actionHash)
    .where((eb) =>
      eb.or([eb('step_key', '=', call.stepKey), eb('status', 'in', ['pending', 'unknown'])]),
    )
    .orderBy('queued_sequence', 'desc')
    .limit(1)
    .executeTakeFirst();
}
