import { writeRecordsInTransaction } from '@heynixie/log';
import type { Transaction } from 'kysely';
import type { ActionsTables, UnknownChoice } from '../types';
import type { ApprovedActionContext } from './create-approved-action';

export interface UnknownAnswer {
  readonly actionID: string;
  readonly choice: UnknownChoice;
  readonly identityID: string;
}

// Writes the owner's answer about an unknown outcome in the caller's transaction. It happened and
// drop settle the action, and retry returns it to pending under the same ID. Returns false for an
// action that waits for no answer.
export async function writeUnknownAnswer(
  tx: Transaction<unknown>,
  context: ApprovedActionContext,
  answer: UnknownAnswer,
): Promise<boolean> {
  const action = await tx
    .$extendTables<ActionsTables>()
    .selectFrom('actions')
    .select(['task_id', 'attempt_count'])
    .where('action_id', '=', answer.actionID)
    .where('status', '=', 'unknown')
    .where('outcome_sequence', 'is not', null)
    .executeTakeFirst();

  if (action === undefined) {
    return false;
  }

  await writeRecordsInTransaction(tx, context.log, [
    {
      kind: 'action.unknown_answered',
      definitions: context.definitions(),
      thread: action.task_id,
      payload: {
        actionID: answer.actionID,
        choice: answer.choice,
        identityID: answer.identityID,
        ...(answer.choice === 'retry' ? { nextAttemptAt: context.clock.now() } : {}),
      },
    },
    ...(answer.choice === 'retry'
      ? []
      : [
          {
            kind: 'action.outcome' as const,
            definitions: context.definitions(),
            thread: action.task_id,
            payload: {
              actionID: answer.actionID,
              status: answer.choice === 'happened' ? 'done' : 'failed',
              attempt: action.attempt_count,
              reason: answer.choice === 'happened' ? null : 'dropped',
            },
            erasable: {},
          },
        ]),
  ]);

  return true;
}
