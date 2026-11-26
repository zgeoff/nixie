import type { Kysely } from 'kysely';
import type { LogTables } from '../types';

// The recorded time of the record that held the task for a route whose stop stands, or null when
// no such stop holds it
export async function readSpendHoldSince(
  db: Kysely<unknown>,
  taskID: string,
): Promise<number | null> {
  const row = await db
    .$extendTables<LogTables>()
    .selectFrom('spend_route_holds')
    .innerJoin('spend_route_stops', 'spend_route_stops.route_id', 'spend_route_holds.route_id')
    .innerJoin('records', 'records.sequence', 'spend_route_holds.updated_sequence')
    .select('records.recorded_at')
    .where('spend_route_holds.task_id', '=', taskID)
    .executeTakeFirst();

  return row === undefined ? null : row.recorded_at;
}
