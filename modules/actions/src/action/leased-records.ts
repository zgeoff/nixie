import type { JSONObject, RecordInput } from '@heynixie/log';
import { readRecords, withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import type { Lease, TasksContext } from '@heynixie/tasks';
import { requireLease, resetLease } from '@heynixie/tasks';
import type { ActionRow, Outcome, OwnerReason } from '../types';
import { creditFailedActions } from './credit-failed-actions';
import { isJSONObject } from './is-json-object';

type SettledOutcome = Exclude<Outcome, { readonly status: 'pending' }>;

export interface Settlement {
  readonly outcome: SettledOutcome;

  readonly details?: JSONObject;

  // Sealed under the outcome record's own key, in order, as its attachments.
  readonly attachments?: readonly Uint8Array<ArrayBuffer>[];
  readonly ownerReason?: OwnerReason;

  // the result record of a call that ran inside the turn, which the outcome names and never copies
  readonly resultSequence?: number;
  readonly rule?: { readonly id: string; readonly revision: number } | null;
}

export interface Attempt {
  readonly lease: Lease;
  readonly action: ActionRow;
  readonly attempt: number;
}

export function buildOutcomeRecord(
  context: Pick<TasksContext, 'definitions'>,
  attempt: Pick<Attempt, 'action' | 'attempt'>,
  settlement: Settlement,
): RecordInput {
  const outcome = settlement.outcome;

  return {
    kind: 'action.outcome',
    definitions: context.definitions(),
    thread: attempt.action.task_id,
    payload: {
      actionID: attempt.action.action_id,
      tool: attempt.action.tool,
      status: outcome.status,
      attempt: attempt.attempt,
      reason: outcome.status === 'done' ? null : outcome.reason,
      ...(settlement.ownerReason === undefined ? {} : { ownerReason: settlement.ownerReason }),
      ...(settlement.resultSequence === undefined
        ? {}
        : { resultSequence: settlement.resultSequence }),
      ...(settlement.rule === undefined || settlement.rule === null
        ? {}
        : { rule: { id: settlement.rule.id, revision: settlement.rule.revision } }),
    },
    erasable: settlement.details ?? {},
    ...(settlement.attachments === undefined ? {} : { attachments: settlement.attachments }),
  };
}

export interface LeasedRecords {
  readonly records: readonly RecordInput[];

  readonly reset: boolean;
}

// The sequences of the records it wrote, in order.
export function writeLeasedRecords(
  context: TasksContext,
  lease: Lease,
  leased: LeasedRecords,
): Promise<readonly number[]> {
  return withWriteTransaction(context.log.writer, async (tx) => {
    await requireLease(tx, lease, context.clock.now());

    const written = await writeRecordsInTransaction(tx, context.log, leased.records);

    await creditFailedActions(tx, context.budgets, leased.records);

    if (leased.reset) {
      await resetLease(tx, lease);
    }

    return written.map((record) => record.sequence);
  });
}

// What the record that queued an action holds: the arguments, and the definitions snapshot the call
// was recorded under, which a connector with more than one version of its declaration reads.
export interface QueuedCall {
  readonly arguments: JSONObject;
  readonly snapshotHash: string;
}

export async function readQueuedCall(
  context: TasksContext,
  sequence: number,
): Promise<QueuedCall | null> {
  const [entry] = await readRecords(context.log, { afterSequence: sequence - 1, limit: 1 });

  const erasable = entry?.record.erasable;
  const args = erasable?.status === 'readable' ? erasable.fields['arguments'] : undefined;

  return entry !== undefined && isJSONObject(args)
    ? { arguments: args, snapshotHash: entry.record.definitions.snapshotHash }
    : null;
}
