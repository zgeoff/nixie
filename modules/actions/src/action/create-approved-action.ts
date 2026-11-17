import type { BudgetsContext } from '@heynixie/budgets';
import type { Clock } from '@heynixie/clock';
import type { Definitions, JSONObject, Log } from '@heynixie/log';
import { writeRecordsInTransaction } from '@heynixie/log';
import type { Transaction } from 'kysely';
import type { ActionRiskClass, ActionsTables } from '../types';
import { creditFailedActions } from './credit-failed-actions';

export interface ApprovedActionContext {
  readonly log: Log;
  readonly clock: Pick<Clock, 'now'>;
  readonly definitions: () => Definitions;

  // what a failed action's lift charge is credited to; absent, the deployment holds no budgets
  readonly budgets?: BudgetsContext;
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
// written failed with its lift charge credited, and the approval still closes its row.
export async function createApprovedAction(
  tx: Transaction<unknown>,
  context: ApprovedActionContext,
  approved: ApprovedAction,
): Promise<string> {
  const db = tx.$extendTables<ActionsTables>();

  const held = await db
    .selectFrom('actions')
    .select(['action_id', 'task_id', 'tool', 'deadline_at', 'attempt_count'])
    .where('held_by_proposal_id', '=', approved.proposalID)
    .executeTakeFirst();

  const isPastDeadline = approved.deadlineAt !== null && context.clock.now() >= approved.deadlineAt;

  if (held !== undefined) {
    const records = [
      isPastDeadline
        ? buildDeadlineRecord(context, {
            actionID: held.action_id,
            taskID: held.task_id,
            tool: held.tool,
            attempt: held.attempt_count,
          })
        : {
            kind: 'action.released' as const,
            definitions: context.definitions(),
            thread: held.task_id,
            payload: { actionID: held.action_id, riskClass: approved.riskClass },
          },
    ];

    await writeRecordsInTransaction(tx, context.log, records);
    await creditFailedActions(tx, context.budgets, records);

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
      ? [
          buildDeadlineRecord(context, {
            actionID: approved.proposalID,
            taskID: approved.taskID,
            tool: approved.tool,
            attempt: 0,
          }),
        ]
      : []),
  ]);

  return approved.proposalID;
}

interface DeadlineFacts {
  readonly actionID: string;
  readonly taskID: string;
  readonly tool: string;
  readonly attempt: number;
}

function buildDeadlineRecord(context: ApprovedActionContext, facts: DeadlineFacts) {
  return {
    kind: 'action.outcome' as const,
    definitions: context.definitions(),
    thread: facts.taskID,
    payload: {
      actionID: facts.actionID,
      tool: facts.tool,
      status: 'failed',
      attempt: facts.attempt,
      reason: 'deadline_passed',
    },
    erasable: { message: 'the action passed its deadline' },
  };
}
