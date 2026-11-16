import { parseJSONObject } from '@heynixie/log';
import type { Kysely } from 'kysely';
import type { TasksTables } from '../types';
import { taskClosedCodec } from './codec/task-closed-codec';
import type { taskClosedByValues } from './codec/task-closed-codec';

// Who closed the task, or null for a task that is not closed. A close that records no closer reads
// as the owner's.
export async function readTaskClosedBy(
  db: Kysely<unknown>,
  taskID: string,
): Promise<(typeof taskClosedByValues)[number] | null> {
  const closed = await db
    .$extendTables<TasksTables>()
    .selectFrom('records')
    .select('payload')
    .where('thread', '=', taskID)
    .where('kind', '=', 'task.closed')
    .orderBy('sequence', 'desc')
    .limit(1)
    .executeTakeFirst();

  return closed === undefined
    ? null
    : (taskClosedCodec.decode(parseJSONObject(closed.payload)).closedBy ?? 'owner');
}
