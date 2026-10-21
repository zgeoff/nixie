import type { Transaction } from 'kysely';
import { sql } from 'kysely';
import type { Migration } from './types';

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
  const columns = await sql`
    select name from pragma_table_info(${table}) where name = 'subject'`.execute(tx);

  if (columns.rows.length === 0) {
    await sql`alter table ${sql.table(table)} add column subject text`.execute(tx);
  }

  await sql`update ${sql.table(table)} set subject = case kind when 'self' then 'self' else 'owner' end where subject is null`.execute(
    tx,
  );
}
