import type { EnvelopeRecord, Projection } from '@heynixie/log';
import type { Transaction, UpdateObject } from 'kysely';
import { sql } from 'kysely';
import { isInboxRecord } from './is-inbox-record';
import type { TaskRecord } from './parse-task-record';
import { parseTaskRecord } from './parse-task-record';
import type { TasksTables } from './types';

// One row per task: its state, its inbox cursor, its step count and the step in flight. Every value
// comes from the record, never from the clock or another table, so a rebuild gives the live rows.
// An inbox record raises the task's last inbox sequence and wakes a waiting task.
export const tasksProjection: Projection = {
  table: 'tasks',
  keyColumn: 'task_id',
  fold: async (tx, record) => {
    const db = tx.$extendTables<TasksTables>();

    if (isInboxRecord(record) && record.thread !== null) {
      return updateInbox(db, record.thread, record.sequence);
    }
    const parsed = parseTaskRecord(record);

    if (parsed === null || parsed.kind === 'timer.fired') {
      return [];
    }
    await applyTaskRecord(db, parsed, record);
    return [parsed.taskID];
  },
};

async function updateInbox(
  db: Transaction<TasksTables>,
  taskID: string,
  sequence: number,
): Promise<readonly string[]> {
  const row = await db
    .updateTable('tasks')
    .set({ last_inbox_sequence: sequence, updated_sequence: sequence })
    .where('task_id', '=', taskID)
    .returning('task_id')
    .executeTakeFirst();

  await db
    .updateTable('tasks')
    .set({ state: 'ready' })
    .where('task_id', '=', taskID)
    .where('state', '=', 'waiting')
    .execute();
  return row === undefined ? [] : [taskID];
}

type TaskRowRecord = Exclude<TaskRecord, { readonly kind: 'timer.fired' }>;

async function applyTaskRecord(
  db: Transaction<TasksTables>,
  parsed: TaskRowRecord,
  record: EnvelopeRecord,
): Promise<void> {
  if (parsed.kind === 'task.created') {
    await db
      .insertInto('tasks')
      .values({
        task_id: parsed.taskID,
        is_conversation: parsed.isConversation ? 1 : 0,
        state: parsed.state,
        read_cursor: 0,
        last_inbox_sequence: 0,
        committed_steps: 0,
        started_step_key: null,
        step_errors: 0,
        claimable_at: 0,
        session_boundary: null,
        created_sequence: record.sequence,
        updated_sequence: record.sequence,
      })
      .execute();
    return;
  }
  await db
    .updateTable('tasks')
    .set({ updated_sequence: record.sequence, ...buildTaskUpdate(parsed) })
    .where('task_id', '=', parsed.taskID)
    .execute();
}

type TaskUpdate = UpdateObject<TasksTables, 'tasks'>;

function buildTaskUpdate(
  parsed: Exclude<TaskRowRecord, { readonly kind: 'task.created' }>,
): TaskUpdate {
  if (parsed.kind === 'task.step_started') {
    return { state: 'running', started_step_key: parsed.stepKey };
  }
  if (parsed.kind === 'task.step_committed') {
    return {
      state: parsed.nextState,
      read_cursor: parsed.readCursor,
      committed_steps: sql<number>`committed_steps + 1`,
      started_step_key: null,
      step_errors: 0,
      session_boundary: parsed.sessionBoundary,
    };
  }
  if (parsed.kind === 'task.step_interrupted') {
    return { started_step_key: null };
  }
  if (parsed.kind === 'task.step_errored') {
    return {
      state: parsed.nextState,
      started_step_key: null,
      step_errors: parsed.errors,
      claimable_at: parsed.claimableAt,
    };
  }

  // a lease_expired record: recovery writes it only for a running task, whose runner is gone
  return { state: 'ready' };
}
