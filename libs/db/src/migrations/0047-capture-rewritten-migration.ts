import { sql } from 'kysely';
import { z } from 'zod';
import { readQueryRows } from '../read-query-rows';
import type { Migration } from '../types';

export const captureRewrittenMigration: Migration = {
  name: 'mark a turn-input capture as rewritten',
  up: async (tx) => {
    const columns = await readQueryRows(
      sql`select name from pragma_table_info('turn_input_captures') where name = 'is_rewritten'`,
      tx,
      z.object({ name: z.string() }),
    );

    if (columns.length === 0) {
      await sql`alter table turn_input_captures
        add column is_rewritten integer not null default 0`.execute(tx);
    }
  },
};
