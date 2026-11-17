import { writeRecordsInTransaction } from '@heynixie/log';
import type { Transaction } from 'kysely';
import type { ActionsTables } from '../types';
import type { ApprovedActionContext } from './create-approved-action';

export interface HeldClose {
  readonly proposalID: string;
  readonly reason: 'declined' | 'lapsed';
}

// A declined or lapsed proposal fails the action it held, so the task hears that the owner said no.
export async function failHeldAction(
  tx: Transaction<unknown>,
  context: ApprovedActionContext,
  held: HeldClose,
): Promise<void> {
  const action = await tx
    .$extendTables<ActionsTables>()
    .selectFrom('actions')
    .select(['action_id', 'task_id', 'tool', 'attempt_count'])
    .where('held_by_proposal_id', '=', held.proposalID)
    .executeTakeFirst();

  if (action === undefined) {
    return;
  }

  await writeRecordsInTransaction(tx, context.log, [
    {
      kind: 'action.outcome',
      definitions: context.definitions(),
      thread: action.task_id,
      payload: {
        actionID: action.action_id,
        tool: action.tool,
        status: 'failed',
        attempt: action.attempt_count,
        reason: held.reason,
      },
      erasable: {},
    },
  ]);
}
