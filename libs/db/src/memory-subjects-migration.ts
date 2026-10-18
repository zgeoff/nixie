import type { Transaction } from 'kysely';
import { sql } from 'kysely';
import type { Migration } from './types';

// Gives every memory item and memory proposal its subject: self for a self-note, owner for every
// other row. The kind column stays for the release before, and the default holds no check, so that
// release still inserts rows. Each step is safe to run again.
export const memorySubjectsMigration: Migration = {
  name: 'add a subject to each memory item and proposal',
  up: async (tx) => {
    await createSubjectColumn(tx, 'memory_items');
    await createSubjectColumn(tx, 'memory_proposals');
  },
};

async function createSubjectColumn(
  tx: Transaction<unknown>,
  table: 'memory_items' | 'memory_proposals',
): Promise<void> {
  const columns = await sql<{ name: string }>`
    select name from pragma_table_info(${table}) where name = 'subject'`.execute(tx);

  if (columns.rows.length === 0) {
    await sql`alter table ${sql.table(table)} add column subject text not null default 'owner'`.execute(
      tx,
    );
  }

  // a self-note's subject is self; the condition leaves a run again with nothing to change
  await sql`update ${sql.table(table)} set subject = 'self'
    where kind = 'self' and subject != 'self'`.execute(tx);
}
