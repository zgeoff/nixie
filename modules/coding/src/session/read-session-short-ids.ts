import type { Log } from '@heynixie/log';
import type { Transaction } from 'kysely';
import type { CodingTables } from '../types';

// The short ID of the coding session that each of the given tasks binds. A task that binds no
// session, or one that has no short ID yet, is left out.
export async function readSessionShortIDs(
  db: Log['writer']['db'] | Transaction<unknown>,
  taskIDs: readonly string[],
): Promise<ReadonlyMap<string, string>> {
  if (taskIDs.length === 0) {
    return new Map();
  }

  const rows = await db
    .$extendTables<CodingTables>()
    .selectFrom('coding_sessions')
    .innerJoin('coding_session_ids', (join) =>
      join
        .onRef('coding_session_ids.adapter', '=', 'coding_sessions.adapter')
        .onRef('coding_session_ids.session_id', '=', 'coding_sessions.session_id'),
    )
    .select(['coding_sessions.task_id', 'coding_session_ids.short_id'])
    .where('coding_sessions.task_id', 'in', [...taskIDs])
    .execute();

  return new Map(rows.map((row) => [row.task_id, row.short_id]));
}
