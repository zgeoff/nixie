import { sql } from 'kysely';
import type { Migration } from '../types';

export const codeFilesMigration: Migration = {
  name: 'create the file table of the code tool',
  up: async (tx) => {
    await sql`create table if not exists code_files (
      file_id text primary key,
      thread text not null,
      sequence integer not null references records (sequence),
      position integer not null,
      bytes integer not null,
      media_type text not null
    ) strict`.execute(tx);
  },
};
