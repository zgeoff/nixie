import type { Transaction } from 'kysely';
import { sql } from 'kysely';
import type { Migration } from './types';

export const memoryConsolidationSummaryMigration: Migration = {
  name: 'add a sealed summary to each consolidation run',
  up: async (tx) => {
    await createColumn(tx, 'summary', 'text');
    await createColumn(tx, 'summary_shares', 'text');
    await createColumn(tx, 'summary_lapse_at', 'integer');
  },
};

async function createColumn(
  tx: Transaction<unknown>,
  name: string,
  definition: 'text' | 'integer',
): Promise<void> {
  const columns = await sql`
    select name from pragma_table_info('memory_consolidations')
    where name = ${name}`.execute(tx);

  if (columns.rows.length === 0) {
    await sql`alter table memory_consolidations
      add column ${sql.id(name)} ${sql.raw(definition)}`.execute(tx);
  }
}
