import { writeRecordsInTransaction } from '@heynixie/log';
import { writeInboxRecordsInTransaction } from '@heynixie/tasks';
import type { Transaction } from 'kysely';
import type { ActionsTables, UnknownChoice } from '../types';
import type { ApprovedActionContext } from './create-approved-action';
import { creditFailedActions } from './credit-failed-actions';

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
    .select(['task_id', 'tool', 'attempt_count', 'runs_in_step'])
    .where('action_id', '=', answer.actionID)
    .where('status', '=', 'unknown')
    .where('outcome_sequence', 'is not', null)
    .executeTakeFirst();

  if (action === undefined) {
    return false;
  }

  const records = [
    {
      kind: 'action.unknown_answered' as const,
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
              tool: action.tool,
              status: answer.choice === 'happened' ? 'done' : 'failed',
              attempt: action.attempt_count,
              reason: answer.choice === 'happened' ? null : 'dropped',
            },
            erasable: {},
          },
        ]),
  ];

  await writeRecordsInTransaction(tx, context.log, records);
  await creditFailedActions(tx, context.budgets, records);

  // No runner claims an action that the task's step runs, so a retry wakes the task for its step.
  if (answer.choice === 'retry' && action.runs_in_step === 1) {
    await writeInboxRecordsInTransaction(tx, context, [
      {
        kind: 'task.wake',
        definitions: context.definitions(),
        thread: action.task_id,
        payload: { at: context.clock.now(), actionID: answer.actionID },
      },
    ]);
  }

  return true;
}
