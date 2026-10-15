import type { Transaction } from 'kysely';
import { sql } from 'kysely';
import type { Migration } from './types';

// Creates the tables of memory consolidation: one row for each run of the consolidator, and one
// row for each change a run's diff proposes, with the versions it read and its status.
export const memoryConsolidationMigration: Migration = {
  name: 'create the memory consolidation tables',
  up: async (tx) => {
    await createRunTable(tx);
    await createChangeTable(tx);
  },
};

async function createRunTable(tx: Transaction<unknown>): Promise<void> {
  await sql`create table memory_consolidations (
    diff_id text primary key,
    model text,
    changes integer not null check (changes >= 0),
    shown_items integer not null check (shown_items >= 0),
    sequence integer not null references records (sequence),
    created_at integer not null
  ) strict`.execute(tx);

  await sql`create index memory_consolidations_by_time on memory_consolidations (
    created_at
  )`.execute(tx);
}

async function createChangeTable(tx: Transaction<unknown>): Promise<void> {
  await sql`create table memory_consolidation_changes (
    change_id text primary key,
    diff_id text not null references memory_consolidations (diff_id),
    position integer not null check (position >= 0),
    kind text not null check (kind in ('merge', 'rewrite', 'retire')),
    item_id text not null,
    inputs text not null check (json_valid(inputs)),
    source text not null check (source in ('owner', 'owner_data', 'untrusted')),
    status text not null check (status in ('pending', 'consumed', 'rejected', 'lapsed')),
    action_hash text not null,
    sealed text not null,
    model text,
    created_sequence integer not null references records (sequence),
    created_at integer not null,
    lapse_at integer not null,
    resolved_sequence integer references records (sequence)
  ) strict`.execute(tx);

  await sql`create index memory_consolidation_changes_by_status on memory_consolidation_changes (
    status, lapse_at
  )`.execute(tx);

  await sql`create index memory_consolidation_changes_by_diff on memory_consolidation_changes (
    diff_id, position
  )`.execute(tx);
}
