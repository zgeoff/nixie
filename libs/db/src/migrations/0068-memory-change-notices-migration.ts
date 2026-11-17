import { sql } from 'kysely';
import type { Migration } from '../types';

// A projection that the log folds into rows: the notice entries of a label edit, a pin and an
// unpin. It sits beside memory_notice_entries, whose change check the release before still reads.
export const memoryChangeNoticesMigration: Migration = {
  name: 'add the notice entries of label edits, pins and unpins',
  up: async (tx) => {
    await sql`create table if not exists memory_change_notices (
      entry_key text primary key,
      notice_key text not null,
      thread text,
      item_id text not null,
      change text not null check (change in ('labelled', 'pinned', 'unpinned')),
      sequence integer not null references records (sequence),
      recorded_at integer not null
    ) strict`.execute(tx);

    await sql`create index if not exists memory_change_notices_by_thread
      on memory_change_notices (thread, notice_key, sequence)`.execute(tx);
  },
};
