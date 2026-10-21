import type { Transaction } from 'kysely';
import { sql } from 'kysely';
import { z } from 'zod';
import { readQueryRows } from './read-query-rows';

// Runs fn in the caller's write transaction with every trigger dropped and the foreign key checks
// deferred to the commit, then creates each trigger again from its own statement. A rollback undoes
// the drops too, so a trigger never stays dropped.
export async function withTriggersDropped<T>(
  tx: Transaction<unknown>,
  fn: () => Promise<T>,
): Promise<T> {
  // SQLite turns the deferral off again at the commit or the rollback
  await sql`pragma defer_foreign_keys = on`.execute(tx);

  const triggers = await readQueryRows(
    sql`select name, sql from sqlite_master where type = 'trigger' order by name`,
    tx,
    z.object({ name: z.string(), sql: z.string() }),
  );

  for (const trigger of triggers) {
    await sql`drop trigger ${sql.id(trigger.name)}`.execute(tx);
  }

  const value = await fn();

  for (const trigger of triggers) {
    await sql.raw(trigger.sql).execute(tx);
  }

  return value;
}
