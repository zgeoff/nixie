import { sql } from 'kysely';
import type { Migration } from './types';

export const backupSetsMigration: Migration = {
  name: 'create the backup sets and their receipts',
  up: async (tx) => {
    await sql`create table if not exists backup_sets (
      sequence integer primary key check (sequence > 0),
      kind text not null check (kind in ('scheduled', 'forget')),
      state text not null
        check (state in ('staging', 'staged', 'published', 'failed', 'abandoned')),
      log_head integer not null,
      staged_at integer not null,
      received_at integer,
      data_snapshot_id text,
      key_snapshot_id text,
      receipt text
    ) strict`.execute(tx);
  },
};
