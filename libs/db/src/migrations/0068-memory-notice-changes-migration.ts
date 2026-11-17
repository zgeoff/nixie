import type { Transaction } from 'kysely';
import { sql } from 'kysely';
import { z } from 'zod';
import { readQueryRows } from '../read-query-rows';
import type { Migration } from '../types';

export const memoryNoticeChangesMigration: Migration = {
  name: 'admit label edits, pins and unpins in the memory notice entries',
  up: async (tx) => {
    const isAdmitted = await probeLabelledAdmitted(tx);

    if (isAdmitted) {
      return;
    }

    await rebuildNoticeEntries(tx);
  },
};

async function probeLabelledAdmitted(tx: Transaction<unknown>): Promise<boolean> {
  const [table] = await readQueryRows(
    sql`select sql from sqlite_master where type = 'table' and name = 'memory_notice_entries'`,
    tx,
    z.object({ sql: z.string() }),
  );

  return table?.sql.includes("'labelled'") === true;
}

// SQLite cannot change a check constraint in place, so the change check that admits the new
// values needs the table built again.
async function rebuildNoticeEntries(tx: Transaction<unknown>): Promise<void> {
  await sql`create table memory_notice_entries_changes (
    entry_key text primary key,
    notice_key text not null,
    thread text,
    item_id text not null,
    version integer check (version is null or version >= 1),
    change text not null check (
      change in (
        'created', 'edited', 'retired', 'restored', 'undone', 'proposed', 'labelled', 'pinned',
        'unpinned'
      )
    ),
    proposal_id text,
    sequence integer not null references records (sequence),
    recorded_at integer not null
  ) strict`.execute(tx);

  await sql`insert into memory_notice_entries_changes (entry_key, notice_key, thread, item_id,
    version, change, proposal_id, sequence, recorded_at)
    select entry_key, notice_key, thread, item_id, version, change, proposal_id, sequence,
      recorded_at
    from memory_notice_entries`.execute(tx);

  await sql`drop table memory_notice_entries`.execute(tx);
  await sql`alter table memory_notice_entries_changes rename to memory_notice_entries`.execute(tx);

  await sql`create index memory_notice_entries_by_thread on memory_notice_entries (
    thread, notice_key, sequence
  )`.execute(tx);
}
