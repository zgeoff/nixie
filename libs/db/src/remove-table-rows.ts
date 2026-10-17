import type { Transaction } from 'kysely';
import { sql } from 'kysely';

// Deletes every row of every table in the database but the kept tables and SQLite's own, inside the
// caller's transaction. A trigger that refuses a delete still refuses, so a caller that empties such
// a table runs this inside withTriggersDropped.
export async function removeTableRows(
  tx: Transaction<unknown>,
  keptTables: readonly string[],
): Promise<void> {
  const result = await sql<{ name: string }>`select name from sqlite_master
    where type = 'table' and name not like 'sqlite\\_%' escape '\\' order by name`.execute(tx);

  const removed = result.rows.filter((table) => !keptTables.includes(table.name));

  for (const table of removed) {
    await sql`delete from ${sql.id(table.name)}`.execute(tx);
  }
}
