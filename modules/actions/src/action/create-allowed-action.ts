import { chargeBudgetsInTransaction, formatBudgetReached } from '@heynixie/budgets';
import type { BudgetsContext } from '@heynixie/budgets';
import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import { buildActionHash as buildPolicyActionHash, writeActionProposal } from '@heynixie/policy';
import type { ProposalConfig } from '@heynixie/proposals';
import { readOpenProposals } from '@heynixie/proposals';
import { requireLease, waitAtFaultPoint } from '@heynixie/tasks';
import type { TasksContext } from '@heynixie/tasks';
import type { Transaction } from 'kysely';
import invariant from 'tiny-invariant';
import type { ActionRow, ActionStatus, ActionsTables, AllowedCall } from '../types';
import { buildActionHash } from './build-action-hash';
import { buildCancelledCheck } from './build-cancelled-check';
import { readRunDecline } from './read-run-decline';

export interface QueuedAction {
  readonly actionID: string;
  readonly status: ActionStatus;

  readonly isRepeat: boolean;
}

export interface AskedAction {
  readonly shortID: string;
}

// The owner declined this same action earlier in the task run, so nothing is queued or asked.
export interface DeclinedAction {
  readonly declinedBy: string;
}

// An allowed call queues an action. A call that a rule's lift allowed charges the lift's budget in
// the same transaction, and when the charge does not land it queues nothing and asks the owner.
export async function createAllowedAction(
  context: TasksContext,
  call: AllowedCall,
  proposalConfig?: ProposalConfig,
): Promise<QueuedAction | AskedAction | DeclinedAction> {
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

    const reached = await chargeLift(tx, context.budgets, call, actionID);

    if (reached !== null) {
      // a purchase the budget still refuses is not asked again once the owner declined it
      const declined = await readRunDecline(tx, {
        taskID,
        actionHash: buildLiftActionHash(call),
      });

      if (declined !== null) {
        return { declinedBy: declined };
      }

      return writeBudgetAsk(tx, { context, proposalConfig }, call, reached);
    }

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
          ...(call.callSequence === undefined ? {} : { callSequence: call.callSequence }),
          ...(call.effects === undefined ? {} : { effects: [...call.effects] }),
          ...(call.deadlineAt === undefined || call.deadlineAt === null
            ? {}
            : { deadlineAt: call.deadlineAt }),
        },
        erasable: { arguments: call.arguments },
      },
    ]);

    return { actionID, status: 'pending' as const, isRepeat: false };
  });

  if ('shortID' in queued || 'declinedBy' in queued) {
    return queued;
  }

  if (NIXIE_TEST_BUILD && !queued.isRepeat) {
    await waitAtFaultPoint('queue.commit.after', { kind: 'action', id: queued.actionID });
  }

  return queued;
}

function readRepeat(
  tx: Transaction<unknown>,
  call: AllowedCall,
): Promise<Pick<ActionRow, 'action_id' | 'status'> | undefined> {
  return (
    tx
      .$extendTables<ActionsTables>()
      .selectFrom('actions')
      .select(['action_id', 'status'])
      .where('task_id', '=', call.step.lease.workID)

      // an action queued before the hash covered the destinations holds the older hash
      .where('action_hash', 'in', [call.actionHash, buildActionHash(call.tool, call.arguments)])
      .where((eb) => {
        const isLive = eb.not(buildCancelledCheck(eb));
        const isOpen = eb.and([eb('status', 'in', ['pending', 'unknown']), isLive]);

        return eb.or([eb('step_key', '=', call.step.stepKey), isOpen]);
      })
      .orderBy('queued_sequence', 'desc')
      .limit(1)
      .executeTakeFirst()
  );
}

// The sentence that says the lift's budget could not take the purchase, or null once it did.
async function chargeLift(
  tx: Transaction<unknown>,
  budgets: BudgetsContext | undefined,
  call: AllowedCall,
  actionID: string,
): Promise<string | null> {
  const lift = call.decision.lift;

  if (lift === undefined) {
    return null;
  }

  invariant(budgets, 'a call that a lift allowed needs the budgets of the server');

  const charged = await chargeBudgetsInTransaction(tx, budgets, {
    budgetIDs: [lift.budgetID],
    amountMicros: lift.amountMicros,
    for: { kind: 'action', id: actionID },
  });

  if (!('error' in charged)) {
    return null;
  }

  return charged.error === 'budget_reached'
    ? formatBudgetReached(charged)
    : `the budget ${charged.budgetID} is not in force.`;
}

// The hash that a budget ask for the call carries.
function buildLiftActionHash(call: AllowedCall): string {
  return buildPolicyActionHash({
    tool: call.tool,
    input: call.arguments,
    destinations: (call.destinations ?? []).map((destination) => destination.value),
    deadlineAt: call.deadlineAt ?? null,
  });
}

interface BudgetAskWriter {
  readonly context: TasksContext;
  readonly proposalConfig: ProposalConfig | undefined;
}

async function writeBudgetAsk(
  tx: Transaction<unknown>,
  writer: BudgetAskWriter,
  call: AllowedCall,
  budgetReached: string,
): Promise<AskedAction> {
  invariant(call.callSequence !== undefined, 'a call that a lift allowed has its call record');

  const context = writer.context;
  const actionHash = buildLiftActionHash(call);

  const open = await readOpenProposals(tx, context.clock.now());

  // a retry of the call that already asked gets the question it asked
  const asked = open.find(
    (row) =>
      row.family === 'action' &&
      row.thread === call.step.lease.workID &&
      row.actionHash === actionHash,
  );

  if (asked !== undefined) {
    return { shortID: asked.shortID };
  }

  const shortID = await writeActionProposal(
    tx,
    {
      log: context.log,
      clock: context.clock,
      definitions: context.definitions,
      proposalConfig: writer.proposalConfig,
    },
    {
      definitions: context.definitions(),
      thread: call.step.lease.workID,
      callSequence: call.callSequence,
      tool: call.tool,
      effects: call.effects ?? [],
      cause: 'always_ask',
      input: call.arguments,
      destinations: call.destinations ?? [],
      content: call.content ?? [],
      deadlineAt: call.deadlineAt ?? null,
      stepKey: call.step.stepKey,
      budgetReached,
    },
  );

  return { shortID };
}
