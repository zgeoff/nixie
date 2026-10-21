import type { Transaction } from 'kysely';
import { sql } from 'kysely';
import { z } from 'zod';
import { readQueryRows } from './read-query-rows';

// Deletes every row of every table in the database but the kept tables and SQLite's own, inside the
// caller's transaction. A trigger that refuses a delete still refuses, so a caller that empties such
// a table runs this inside withTriggersDropped.
export async function removeTableRows(
  tx: Transaction<unknown>,
  keptTables: readonly string[],
): Promise<void> {
  const tables = await readQueryRows(
    sql`select name from sqlite_master
      where type = 'table' and name not like 'sqlite\\_%' escape '\\' order by name`,
    tx,
    z.object({ name: z.string() }),
  );

  const removed = tables.filter((table) => !keptTables.includes(table.name));

  for (const table of removed) {
    await sql`delete from ${sql.id(table.name)}`.execute(tx);
  }
}
