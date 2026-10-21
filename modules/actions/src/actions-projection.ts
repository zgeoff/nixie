import type { EnvelopeRecord, Projection } from '@heynixie/log';
import type { Transaction, UpdateObject } from 'kysely';
import type { ActionRecord } from './parse-action-record';
import { parseActionRecord } from './parse-action-record';
import type { ActionsTables } from './types';

export const actionsProjection: Projection = {
  table: 'actions',
  keyColumn: 'action_id',
  fold: async (tx, record) => {
    const parsed = parseActionRecord(record);

    if (parsed === null) {
      return [];
    }

    await applyActionRecord(tx.$extendTables<ActionsTables>(), parsed, record);

    return [parsed.actionID];
  },
};

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
        updated_sequence: record.sequence,
      })
      .execute();

    return;
  }

  await db
    .updateTable('actions')
    .set({ updated_sequence: record.sequence, ...buildActionUpdate(parsed, record.sequence) })
    .where('action_id', '=', parsed.actionID)
    .execute();
}

function buildActionUpdate(
  parsed: Exclude<ActionRecord, { readonly kind: 'action.queued' }>,
  sequence: number,
): UpdateObject<ActionsTables, 'actions'> {
  if (parsed.kind === 'action.attempt_started') {
    return { attempt_count: parsed.attempt, attempt_open: 1 };
  }

  if (parsed.kind === 'action.retry_scheduled') {
    return { attempt_open: 0, next_attempt_at: parsed.nextAttemptAt, reason: parsed.reason };
  }

  return {
    status: parsed.status,
    attempt_open: 0,
    reason: parsed.reason,
    outcome_sequence: sequence,
  };
}
