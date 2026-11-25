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

// What the record that queued an action holds: the arguments, and the snapshot that a connector with
// more than one version of its declaration reads. That is the first attempt's snapshot once an
// attempt has started, and the queued call's before.
export interface QueuedCall {
  readonly arguments: JSONObject;
  readonly snapshotHash: string;
}

export async function readQueuedCall(
  context: TasksContext,
  action: Pick<ActionRow, 'action_id' | 'task_id' | 'queued_sequence' | 'attempt_count'>,
): Promise<QueuedCall | null> {
  const [entry] = await readRecords(context.log, {
    afterSequence: action.queued_sequence - 1,
    limit: 1,
  });

  const erasable = entry?.record.erasable;
  const args = erasable?.status === 'readable' ? erasable.fields['arguments'] : undefined;

  if (entry === undefined || !isJSONObject(args)) {
    return null;
  }

  const firstAttempt =
    action.attempt_count === 0 ? null : await readFirstAttemptSnapshot(context, action);

  return {
    arguments: args,
    snapshotHash: firstAttempt ?? entry.record.definitions.snapshotHash,
  };
}

// The snapshot the record of the action's first attempt holds, which names the declaration that the
// attempt sent under. Null when no such record exists.
async function readFirstAttemptSnapshot(
  context: TasksContext,
  action: Pick<ActionRow, 'action_id' | 'task_id' | 'queued_sequence'>,
): Promise<string | null> {
  let afterSequence = action.queued_sequence;

  for (;;) {
    const entries = await readRecords(context.log, {
      afterSequence,
      thread: action.task_id,
      kinds: ['action.attempt_started'],
    });

    const first = entries.find(
      (entry) =>
        entry.record.payload['actionID'] === action.action_id &&
        entry.record.payload['attempt'] === 1,
    );

    if (first !== undefined) {
      return first.record.definitions.snapshotHash;
    }

    const last = entries.at(-1);

    if (last === undefined) {
      return null;
    }

    afterSequence = last.record.sequence;
  }
}
