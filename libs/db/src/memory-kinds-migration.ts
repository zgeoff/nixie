import type { Transaction } from 'kysely';
import { sql } from 'kysely';
import type { Migration } from './types';

// Gives every memory item and memory proposal its kind, a fact or a self-note. The default makes
// every existing row a fact and holds no check, so the release before still inserts rows. Each step
// is safe to run again.
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
  const columns = await sql<{ name: string }>`
    select name from pragma_table_info(${table}) where name = 'kind'`.execute(tx);

  if (columns.rows.length === 0) {
    await sql`alter table ${sql.table(table)} add column kind text not null default 'fact'`.execute(
      tx,
    );
  }
}
