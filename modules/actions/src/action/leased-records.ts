import type { JSONObject, RecordInput } from '@heynixie/log';
import { readRecords, withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import type { Lease, TasksContext } from '@heynixie/tasks';
import { requireLease, resetLease } from '@heynixie/tasks';
import type { ActionRow, Outcome, OwnerReason } from '../types';
import { isJSONObject } from './is-json-object';

type SettledOutcome = Exclude<Outcome, { readonly status: 'pending' }>;

export interface Settlement {
  readonly outcome: SettledOutcome;

  readonly details?: JSONObject;
  readonly ownerReason?: OwnerReason;
  readonly rule?: { readonly id: string; readonly revision: number } | null;
}

export interface Attempt {
  readonly lease: Lease;
  readonly action: ActionRow;
  readonly attempt: number;
}

export function buildOutcomeRecord(
  context: TasksContext,
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
      status: outcome.status,
      attempt: attempt.attempt,
      reason: outcome.status === 'done' ? null : outcome.reason,
      ...(settlement.ownerReason === undefined ? {} : { ownerReason: settlement.ownerReason }),
      ...(settlement.rule === undefined || settlement.rule === null
        ? {}
        : { rule: { id: settlement.rule.id, revision: settlement.rule.revision } }),
    },
    erasable: settlement.details ?? {},
  };
}

export interface LeasedRecords {
  readonly records: readonly RecordInput[];

  readonly reset: boolean;
}

export async function writeLeasedRecords(
  context: TasksContext,
  lease: Lease,
  leased: LeasedRecords,
): Promise<void> {
  await withWriteTransaction(context.log.writer, async (tx) => {
    await requireLease(tx, lease, context.clock.now());
    await writeRecordsInTransaction(tx, context.log, leased.records);

    if (leased.reset) {
      await resetLease(tx, lease);
    }
  });
}

export async function readArguments(
  context: TasksContext,
  sequence: number,
): Promise<JSONObject | null> {
  const [entry] = await readRecords(context.log, { afterSequence: sequence - 1, limit: 1 });

  const erasable = entry?.record.erasable;
  const args = erasable?.status === 'readable' ? erasable.fields['arguments'] : undefined;

  return isJSONObject(args) ? args : null;
}
