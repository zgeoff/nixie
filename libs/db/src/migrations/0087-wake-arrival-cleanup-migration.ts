import { sql } from 'kysely';
import type { Migration } from '../types';

export const wakeArrivalCleanupMigration: Migration = {
  name: 'create the table of the mail arrivals whose key waits for removal',
  up: async (tx) => {
    await sql`create table if not exists wake_arrival_cleanup (
      arrived_seq integer primary key
    ) strict`.execute(tx);
  },
};
