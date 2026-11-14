import { sql } from 'kysely';
import { z } from 'zod';
import { readQueryRows } from '../read-query-rows';
import type { Migration } from '../types';

export const webFetchFetchURLMigration: Migration = {
  name: 'record the sent URL of a stored web fetch page',
  up: async (tx) => {
    const columns = await readQueryRows(
      sql`select name from pragma_table_info('web_fetch_pages') where name = 'fetch_url'`,
      tx,
      z.object({ name: z.string() }),
    );

    if (columns.length === 0) {
      await sql`alter table web_fetch_pages add column fetch_url text`.execute(tx);
    }
  },
};
