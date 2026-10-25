import { parseJSONObject } from '@heynixie/log';
import type { Transaction } from 'kysely';
import { isInboxRecord } from './is-inbox-record';
import { isWakingRecord } from './is-waking-record';
import { planReadCursor } from './plan-read-cursor';
import type { TasksTables } from './types';

interface StepCursor {
  readonly readCursor: number;
  readonly hasUnread: boolean;
}

export async function readStepCursor(
  tx: Transaction<unknown>,
  taskID: string,
  acknowledged: readonly number[],
): Promise<StepCursor> {
  const db = tx.$extendTables<TasksTables>();

  const task = await db
    .selectFrom('tasks')
    .select('read_cursor')
    .where('task_id', '=', taskID)
    .executeTakeFirstOrThrow();

  const unread = await db
    .selectFrom('records')
    .select(['sequence', 'kind', 'thread', 'payload'])
    .where('thread', '=', taskID)
    .where('sequence', '>', task.read_cursor)
    .orderBy('sequence')
    .execute();

  const inbox = unread.filter((record) => isInboxRecord(record));

  const read = new Set(acknowledged);

  const readCursor = planReadCursor(
    inbox.map((record) => record.sequence),
    task.read_cursor,
    acknowledged,
  );

  // A message that did not wake the task waits for its next wake, so only waking input left
  // unread makes the task ready again.
  const hasUnread = inbox.some(
    (record) =>
      record.sequence > readCursor &&
      !read.has(record.sequence) &&
      isWakingRecord({ ...record, payload: parseJSONObject(record.payload) }),
  );

  return { readCursor, hasUnread };
}
