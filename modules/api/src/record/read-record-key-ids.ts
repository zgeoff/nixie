import type { Kysely } from 'kysely';
import type { APITables } from '../types';

// The key of each record that has one, in no order.
export async function readRecordKeyIDs(
  db: Kysely<unknown>,
  sequences: readonly number[],
): Promise<readonly string[]> {
  if (sequences.length === 0) {
    return [];
  }

  const rows = await db
    .$extendTables<APITables>()
    .selectFrom('records')
    .select('key_id')
    .where('sequence', 'in', sequences)
    .execute();

  return rows.flatMap((row) => (row.key_id === null ? [] : [row.key_id]));
}
