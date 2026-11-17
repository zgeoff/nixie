import type { EnvelopeRecord, Projection } from '@heynixie/log';
import { taskStoppedCodec } from '@heynixie/tasks';
import type { ExpressionBuilder, Transaction, UpdateObject } from 'kysely';
import { match } from 'ts-pattern';
import type { ActionsTables } from '../types';
import { buildCancelledCheck } from './build-cancelled-check';
import type { ActionRecord } from './parse-action-record';
import { parseActionRecord } from './parse-action-record';

export const actionsProjection: Projection = {
  table: 'actions',
  keyColumn: 'action_id',
  fold: async (tx, record) => {
    if (record.kind === taskStoppedCodec.kind) {
      return writeCancelledActions(tx.$extendTables<ActionsTables>(), record);
    }

    const parsed = parseActionRecord(record);

    if (parsed === null) {
      return [];
    }

    await applyActionRecord(tx.$extendTables<ActionsTables>(), parsed, record);

    return [parsed.actionID];
  },
};

async function writeCancelledActions(
  db: Transaction<ActionsTables>,
  record: EnvelopeRecord,
): Promise<string[]> {
  const stopped = taskStoppedCodec.decode(record.payload);

  const unstarted = await db
    .selectFrom('actions')
    .select('action_id')
    .where('task_id', '=', stopped.taskID)
    .where('status', '=', 'pending')
    .where('attempt_count', '=', 0)
    .where((eb) => eb.not(buildCancelledCheck(eb)))
    .execute();

  const actionIDs = unstarted.map((row) => row.action_id);

  if (actionIDs.length > 0) {
    await db
      .updateTable('actions')
      .set({ cancelled_sequence: record.sequence, updated_sequence: record.sequence })
      .where('action_id', 'in', actionIDs)
      .execute();
  }

  return actionIDs;
}

async function applyActionRecord(
  db: Transaction<ActionsTables>,
  parsed: ActionRecord,
  record: EnvelopeRecord,
): Promise<void> {
  if (parsed.kind === 'action.queued') {
    await db
      .insertInto('actions')
      .values({
        action_id: parsed.actionID,
        task_id: parsed.taskID,
        step_key: parsed.stepKey,
        action_hash: parsed.actionHash,
        tool: parsed.tool,
        status: 'pending',
        attempt_count: 0,
        attempt_open: 0,
        next_attempt_at: parsed.nextAttemptAt,
        reason: null,
        queued_sequence: record.sequence,
        outcome_sequence: null,
        cancelled_sequence: null,
        updated_sequence: record.sequence,
        call_sequence: parsed.callSequence,
        deadline_at: parsed.deadlineAt,
        risk_class: parsed.riskClass,
        is_approved: parsed.isApproved ? 1 : 0,
        runs_in_step: parsed.runsInStep ? 1 : 0,
        held_by_proposal_id: null,
        unknown_streak: 0,
        first_attempt_at: null,
        last_attempt_at: null,
        reconcile_at: null,
      })
      .execute();

    return;
  }

  await db
    .updateTable('actions')
    .set((eb) => ({
      updated_sequence: record.sequence,
      ...buildActionUpdate(eb, parsed, {
        sequence: record.sequence,
        at: record.recordedAt.getTime(),
      }),
    }))
    .where('action_id', '=', parsed.actionID)
    .execute();
}

interface RecordStamp {
  readonly sequence: number;
  readonly at: number;
}

function buildActionUpdate(
  eb: ExpressionBuilder<ActionsTables, 'actions'>,
  parsed: Exclude<ActionRecord, { readonly kind: 'action.queued' }>,
  stamp: RecordStamp,
): UpdateObject<ActionsTables, 'actions'> {
  return match(parsed)
    .with({ kind: 'action.attempt_started' }, (record) => ({
      attempt_count: record.attempt,
      attempt_open: 1,
      last_attempt_at: stamp.at,
      first_attempt_at: eb.fn.coalesce('first_attempt_at', eb.val(stamp.at)),
    }))
    .with({ kind: 'action.retry_scheduled' }, (record) => ({
      attempt_open: 0,
      next_attempt_at: record.nextAttemptAt,
      reason: record.reason,
      unknown_streak: 0,
    }))
    .with({ kind: 'action.reconcile_scheduled', step: 'retry' }, (record) => ({
      status: 'pending' as const,
      attempt_open: 0,
      next_attempt_at: record.at,
      reconcile_at: null,
      unknown_streak: eb('unknown_streak', '+', 1),
    }))
    .with({ kind: 'action.reconcile_scheduled', step: 'check' }, (record) => ({
      status: 'unknown' as const,
      attempt_open: 0,
      reconcile_at: record.at,
      outcome_sequence: null,
      unknown_streak: eb('unknown_streak', '+', 1),
    }))
    .with({ kind: 'action.reconcile_checked' }, (record) =>
      record.nextAttemptAt === null
        ? { reconcile_at: null }
        : { reconcile_at: null, status: 'pending' as const, next_attempt_at: record.nextAttemptAt },
    )
    .with({ kind: 'action.held' }, (record) => ({ held_by_proposal_id: record.proposalID }))
    .with({ kind: 'action.released' }, (record) => ({
      held_by_proposal_id: null,
      is_approved: 1 as const,
      ...(record.riskClass === null ? {} : { risk_class: record.riskClass }),
    }))
    .with({ kind: 'action.unknown_answered', choice: 'retry' }, (record) => ({
      status: 'pending' as const,
      attempt_open: 0,
      outcome_sequence: null,
      reason: null,
      unknown_streak: 0,
      next_attempt_at: record.nextAttemptAt ?? stamp.at,
    }))
    .with({ kind: 'action.unknown_answered' }, () => ({}))
    .with({ kind: 'action.outcome' }, (record) => ({
      status: record.status,
      attempt_open: 0,
      reason: record.reason,
      outcome_sequence: stamp.sequence,
      held_by_proposal_id: null,
      reconcile_at: null,
    }))
    .exhaustive();
}
