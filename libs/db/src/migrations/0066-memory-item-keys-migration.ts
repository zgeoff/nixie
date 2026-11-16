import { sql } from 'kysely';
import type { Migration } from '../types';

// Both tables are projections that the log folds into rows, so a log with no key or purge records
// leaves them empty.
export const memoryItemKeysMigration: Migration = {
  name: 'add the memory item keys and evidence purges',
  up: async (tx) => {
    await sql`create table if not exists memory_item_keys (
      key_id text primary key,
      item_id text not null,
      kind text not null,
      version integer,
      sealed_evidence_quote text,
      sealed_intent_quote text,
      from_sequence integer not null,
      removed_sequence integer
    ) strict`.execute(tx);

    await sql`create index if not exists memory_item_keys_by_item
      on memory_item_keys (item_id)`.execute(tx);

    await sql`create table if not exists memory_evidence_purges (
      purge_key text primary key,
      record_sequence integer not null,
      item_id text not null,
      closed_sequence integer,
      purged_sequence integer,
      bridge_version integer,
      labels_revision integer
    ) strict`.execute(tx);

    await sql`create index if not exists memory_evidence_purges_by_item
      on memory_evidence_purges (item_id)`.execute(tx);
  },
};
