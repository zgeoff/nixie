import type { Clock } from '@heynixie/clock';
import type { Definitions, JSONObject, Log } from '@heynixie/log';
import { writeRecordsInTransaction } from '@heynixie/log';
import type { Transaction } from 'kysely';
import type { ActionRiskClass, ActionsTables } from '../types';

export interface ApprovedActionContext {
  readonly log: Log;
  readonly clock: Pick<Clock, 'now'>;
  readonly definitions: () => Definitions;
}

// What an approval answered: the action of the proposal row, which the owner approved as shown.
export interface ApprovedAction {
  // the proposal's ID, which is also the action's ID
  readonly proposalID: string;
  readonly taskID: string;
  readonly stepKey: string | null;
  readonly tool: string;
  readonly effects: readonly string[];
  readonly actionHash: string;
  readonly arguments: JSONObject;
  readonly callSequence: number;
  readonly riskClass: ActionRiskClass;
  readonly deadlineAt: number | null;

  // whether the task's step runs the action, for a tool that runs inside the turn
  readonly runsInStep: boolean;
}

// Queues the action an approval answered, in the answer's transaction, so a second answer finds the
// row closed. A proposal that holds an action releases it instead. Past its deadline the action is
// written failed, and the approval still closes its row.
export async function createApprovedAction(
  tx: Transaction<unknown>,
  context: ApprovedActionContext,
  approved: ApprovedAction,
): Promise<string> {
  const db = tx.$extendTables<ActionsTables>();

  const held = await db
    .selectFrom('actions')
    .select(['action_id', 'task_id', 'deadline_at', 'attempt_count'])
    .where('held_by_proposal_id', '=', approved.proposalID)
    .executeTakeFirst();

  const isPastDeadline = approved.deadlineAt !== null && context.clock.now() >= approved.deadlineAt;

  if (held !== undefined) {
    await writeRecordsInTransaction(tx, context.log, [
      isPastDeadline
        ? buildDeadlineRecord(context, held.action_id, held.task_id, held.attempt_count)
        : {
            kind: 'action.released',
            definitions: context.definitions(),
            thread: held.task_id,
            payload: { actionID: held.action_id, riskClass: approved.riskClass },
          },
    ]);

    return held.action_id;
  }

  const existing = await db
    .selectFrom('actions')
    .select('action_id')
    .where('action_id', '=', approved.proposalID)
    .executeTakeFirst();

  if (existing !== undefined) {
    return existing.action_id;
  }

  await writeRecordsInTransaction(tx, context.log, [
    {
      kind: 'action.queued',
      definitions: context.definitions(),
      thread: approved.taskID,
      payload: {
        actionID: approved.proposalID,
        taskID: approved.taskID,
        stepKey: approved.stepKey ?? approved.proposalID,
        tool: approved.tool,
        effects: [...approved.effects],
        actionHash: approved.actionHash,
        nextAttemptAt: context.clock.now(),
        callSequence: approved.callSequence,
        riskClass: approved.riskClass,
        isApproved: true,
        ...(approved.runsInStep ? { runsInStep: true } : {}),
        ...(approved.deadlineAt === null ? {} : { deadlineAt: approved.deadlineAt }),
      },
      erasable: { arguments: approved.arguments },
    },
    ...(isPastDeadline
      ? [buildDeadlineRecord(context, approved.proposalID, approved.taskID, 0)]
      : []),
  ]);

  return approved.proposalID;
}

function buildDeadlineRecord(
  context: ApprovedActionContext,
  actionID: string,
  taskID: string,
  attempt: number,
) {
  return {
    kind: 'action.outcome' as const,
    definitions: context.definitions(),
    thread: taskID,
    payload: { actionID, status: 'failed', attempt, reason: 'deadline_passed' },
    erasable: { message: 'the action passed its deadline' },
  };
}
