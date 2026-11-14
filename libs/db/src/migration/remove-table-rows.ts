import type { Transaction } from 'kysely';
import { sql } from 'kysely';
import { z } from 'zod';
import { readQueryRows } from './read-query-rows';

// A trigger that refuses a delete still refuses it here, so the caller drops such triggers in the
// same transaction first.
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
