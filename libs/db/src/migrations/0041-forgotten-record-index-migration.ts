import { sql } from 'kysely';
import type { Migration } from '../types';

export const forgottenRecordIndexMigration: Migration = {
  name: 'index the records that a forget names',
  up: async (tx) => {
    await sql`create index if not exists records_by_forgotten_sequence
      on records (json_extract(payload, '$.recordSequence'))
      where kind = 'record.forget_started'`.execute(tx);
  },
};
