import type { Transaction } from 'kysely';
import { sql } from 'kysely';

// Runs fn in the caller's write transaction with every trigger dropped and the foreign key checks
// deferred to the commit, then creates each trigger again from its own statement. A rollback undoes
// the drops too, so a trigger never stays dropped.
export async function withTriggersDropped<T>(
  tx: Transaction<unknown>,
  fn: () => Promise<T>,
): Promise<T> {
  // SQLite turns the deferral off again at the commit or the rollback
  await sql`pragma defer_foreign_keys = on`.execute(tx);

  const result = await sql<TriggerRow>`select name, sql from sqlite_master
    where type = 'trigger' order by name`.execute(tx);

  for (const trigger of result.rows) {
    // oxlint-disable-next-line no-await-in-loop -- the transaction runs one statement at a time
    await sql`drop trigger ${sql.id(trigger.name)}`.execute(tx);
  }

  const value = await fn();

  for (const trigger of result.rows) {
    // oxlint-disable-next-line no-await-in-loop -- the transaction runs one statement at a time
    await sql.raw(trigger.sql).execute(tx);
  }

  return value;
}

interface TriggerRow {
  readonly name: string;
  readonly sql: string;
}
