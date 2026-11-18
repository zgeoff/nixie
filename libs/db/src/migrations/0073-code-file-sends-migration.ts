import { sql } from 'kysely';
import type { Migration } from '../types';

export const codeFileSendsMigration: Migration = {
  name: 'create the send table of the code tool',
  up: async (tx) => {
    await sql`create table if not exists code_file_sends (
      sequence integer primary key references records (sequence),
      file_id text not null references code_files (file_id),
      thread text not null
    ) strict`.execute(tx);

    await sql`create index if not exists code_file_sends_file on code_file_sends (file_id)`.execute(
      tx,
    );
  },
};
