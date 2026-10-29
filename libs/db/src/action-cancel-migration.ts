import { sql } from 'kysely';
import type { Migration } from './types';

export const actionCancelMigration: Migration = {
  name: 'record the stop that cancelled each action before its first attempt',
  up: async (tx) => {
    const cancelledSequence = await sql`
      select name from pragma_table_info('actions') where name = 'cancelled_sequence'`.execute(tx);

    if (cancelledSequence.rows.length === 0) {
      await sql`alter table actions add column cancelled_sequence integer
        references records (sequence)`.execute(tx);
    }
  },
};
