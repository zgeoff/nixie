import type { Log } from '@heynixie/log';
import type { TasksTables } from '@heynixie/tasks';
import type { Transaction } from 'kysely';
import type { CodingTables } from '../types';

// The open coding task that binds each of the adapter's sessions: a task that has not let go of the
// session and is not done, failed or closed.
export async function readOpenBindings(
  db: Log['writer']['db'] | Transaction<unknown>,
  adapter: string,
  sessionIDs: readonly string[],
): Promise<ReadonlyMap<string, string>> {
  if (sessionIDs.length === 0) {
    return new Map();
  }

  const rows = await db
    .$extendTables<CodingTables & TasksTables>()
    .selectFrom('coding_sessions')
    .innerJoin('tasks', 'tasks.task_id', 'coding_sessions.task_id')
    .select(['coding_sessions.session_id', 'coding_sessions.task_id'])
    .where('coding_sessions.adapter', '=', adapter)
    .where('coding_sessions.session_id', 'in', [...sessionIDs])
    .where('coding_sessions.unbound_at', 'is', null)
    .where('tasks.state', 'not in', ['done', 'failed', 'closed'])
    .execute();

  return new Map(rows.map((row) => [row.session_id, row.task_id]));
}
