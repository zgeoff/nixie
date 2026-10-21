import type { Transaction } from 'kysely';
import { sql } from 'kysely';
import { z } from 'zod';
import { buildShortIDFromUUID } from './build-short-id-from-uuid';
import { readQueryRows } from './read-query-rows';
import type { Migration } from './types';

export const memoryShortIDsMigration: Migration = {
  name: 'add a short ID to each memory item',
  up: async (tx) => {
    await createShortIDColumn(tx);

    await sql`create unique index if not exists memory_items_by_short_id on memory_items (
      short_id
    )`.execute(tx);

    await writeShortIDs(tx);
  },
};

async function createShortIDColumn(tx: Transaction<unknown>): Promise<void> {
  const columns = await sql`
    select name from pragma_table_info('memory_items') where name = 'short_id'`.execute(tx);

  if (columns.rows.length === 0) {
    await sql`alter table memory_items add column short_id text`.execute(tx);
  }
}

async function writeShortIDs(tx: Transaction<unknown>): Promise<void> {
  const items = await readQueryRows(
    sql`select item_id from memory_items where short_id is null`,
    tx,
    z.object({ item_id: z.string() }),
  );

  for (const item of items) {
    await sql`update memory_items set short_id = ${buildShortIDFromUUID(item.item_id)}
      where item_id = ${item.item_id}`.execute(tx);
  }
}
