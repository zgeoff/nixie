import type { Transaction } from 'kysely';
import { sql } from 'kysely';
import type { Migration } from './types';

export const memorySensitiveMigration: Migration = {
  name: 'add a sensitive flag to each memory item and proposal',
  up: async (tx) => {
    await createSensitiveColumn(tx, 'memory_items');
    await createSensitiveColumn(tx, 'memory_proposals');
  },
};

async function createSensitiveColumn(
  tx: Transaction<unknown>,
  table: 'memory_items' | 'memory_proposals',
): Promise<void> {
  const columns = await sql`
    select name from pragma_table_info(${table}) where name = 'is_sensitive'`.execute(tx);

  if (columns.rows.length === 0) {
    await sql`alter table ${sql.table(table)} add column is_sensitive integer not null default 0`.execute(
      tx,
    );
  }
}
