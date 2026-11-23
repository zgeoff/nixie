import type { Kysely } from 'kysely';
import type { LogTables } from '../types';

// The recorded time of the record that set the standing spending stop, or null when none stands.
// A later trip that replaces the row moves it.
export async function readSpendStopSince(db: Kysely<unknown>): Promise<number | null> {
  const row = await db
    .$extendTables<LogTables>()
    .selectFrom('spend_stop')
    .innerJoin('records', 'records.sequence', 'spend_stop.updated_sequence')
    .select('records.recorded_at')
    .executeTakeFirst();

  return row === undefined ? null : row.recorded_at;
}
