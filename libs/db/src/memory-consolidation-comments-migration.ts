import type { Transaction } from 'kysely';
import { sql } from 'kysely';
import { z } from 'zod';
import { buildShortIDFromUUID } from './build-short-id-from-uuid';
import { readQueryRows } from './read-query-rows';
import type { Migration } from './types';

// Gives every consolidation change the short ID the model reads, and a place for the sealed comment
// the conversation leaves on it with the record that left it. An existing change takes the short ID
// its UUID gives, as the changes fold does at a rebuild. Each step is safe to run again.
export const memoryConsolidationCommentsMigration: Migration = {
  name: 'add a short ID and a comment to each consolidation change',
  up: async (tx) => {
    await createColumn(tx, 'short_id', 'text');
    await createColumn(tx, 'comment', 'text');
    await createColumn(tx, 'comment_sequence', 'integer references records (sequence)');

    await sql`create unique index if not exists memory_consolidation_changes_by_short_id
      on memory_consolidation_changes (short_id)`.execute(tx);

    await writeShortIDs(tx);
  },
};

async function createColumn(
  tx: Transaction<unknown>,
  name: string,
  definition: 'text' | 'integer references records (sequence)',
): Promise<void> {
  const columns = await sql`
    select name from pragma_table_info('memory_consolidation_changes')
    where name = ${name}`.execute(tx);

  if (columns.rows.length === 0) {
    await sql`alter table memory_consolidation_changes
      add column ${sql.id(name)} ${sql.raw(definition)}`.execute(tx);
  }
}

// the backfill, which fills only the changes still without a short ID
async function writeShortIDs(tx: Transaction<unknown>): Promise<void> {
  const changes = await readQueryRows(
    sql`select change_id from memory_consolidation_changes where short_id is null`,
    tx,
    z.object({ change_id: z.string() }),
  );

  for (const change of changes) {
    await sql`update memory_consolidation_changes
      set short_id = ${buildShortIDFromUUID(change.change_id)}
      where change_id = ${change.change_id}`.execute(tx);
  }
}
