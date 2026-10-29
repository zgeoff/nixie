import { sql } from 'kysely';
import type { Migration } from './types';

export const memorySubjectChangesMigration: Migration = {
  name: 'add the subject that each memory proposal moves its item to',
  up: async (tx) => {
    const columns = await sql`
      select name from pragma_table_info('memory_proposals') where name = 'new_subject'`.execute(
      tx,
    );

    if (columns.rows.length === 0) {
      await sql`alter table memory_proposals add column new_subject text`.execute(tx);
    }
  },
};
