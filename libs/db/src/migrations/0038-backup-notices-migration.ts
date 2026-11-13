import { sql } from 'kysely';
import type { Migration } from '../types';

export const backupNoticesMigration: Migration = {
  name: 'create the notices of failed and missing backup receipts',
  up: async (tx) => {
    await sql`create table if not exists backup_notices (
      sequence integer not null references backup_sets (sequence),
      cause text not null check (cause in ('failed', 'missing')),
      raised_at integer not null,
      primary key (sequence, cause)
    ) strict`.execute(tx);
  },
};
