import type { Transaction } from 'kysely';
import { sql } from 'kysely';
import type { Migration } from './types';

export const memoryKindsMigration: Migration = {
  name: 'add a kind to each memory item and proposal',
  up: async (tx) => {
    await createKindColumn(tx, 'memory_items');
    await createKindColumn(tx, 'memory_proposals');
  },
};

async function createKindColumn(
  tx: Transaction<unknown>,
  table: 'memory_items' | 'memory_proposals',
): Promise<void> {
  const columns = await sql`
    select name from pragma_table_info(${table}) where name = 'kind'`.execute(tx);

  if (columns.rows.length === 0) {
    await sql`alter table ${sql.table(table)} add column kind text not null default 'fact'`.execute(
      tx,
    );
  }
}
