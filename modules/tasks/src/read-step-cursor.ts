import type { Transaction } from 'kysely';
import { isInboxRecord } from './is-inbox-record';
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
    .select(['read_cursor', 'last_inbox_sequence'])
    .where('task_id', '=', taskID)
    .executeTakeFirstOrThrow();

  const unread = await db
    .selectFrom('records')
    .select(['sequence', 'kind', 'thread'])
    .where('thread', '=', taskID)
    .where('sequence', '>', task.read_cursor)
    .orderBy('sequence')
    .execute();

  const readCursor = planReadCursor(
    unread.filter((record) => isInboxRecord(record)).map((record) => record.sequence),
    task.read_cursor,
    acknowledged,
  );

  return { readCursor, hasUnread: task.last_inbox_sequence > readCursor };
}
