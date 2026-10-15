import { sql } from 'kysely';
import type { Migration } from './types';

// Creates the memory projections: one row per memory item with its current version, state and pin,
// and one row per version with its text sealed under the item's key and its provenance in plain
// columns, so a review filters on provenance without decrypting anything.
export const memoryMigration: Migration = {
  name: 'create the memory projections',
  up: async (tx) => {
    await sql`create table memory_items (
      item_id text primary key,
      version integer not null check (version >= 1),
      state text not null check (state in ('active', 'retired', 'forgetting', 'forgotten')),
      is_pinned integer not null check (is_pinned in (0, 1)),
      pinned_sequence integer references records (sequence),
      created_sequence integer not null references records (sequence),
      updated_sequence integer not null references records (sequence),
      forgotten_sequence integer references records (sequence)
    ) strict`.execute(tx);

    await sql`create index memory_items_by_state on memory_items (state, created_sequence)`.execute(
      tx,
    );

    await sql`create table memory_versions (
      version_key text primary key,
      item_id text not null references memory_items (item_id),
      version integer not null check (version >= 1),
      change text not null check (change in ('created', 'edited', 'retired', 'restored', 'undone')),
      state text not null check (state in ('active', 'retired')),
      sealed text not null,
      evidence text check (evidence is null or json_valid(evidence)),
      intent_evidence text check (intent_evidence is null or json_valid(intent_evidence)),
      origin text not null check (origin in ('owner', 'conversation', 'task', 'memory_writer')),
      source text not null check (source in ('owner', 'owner_data', 'untrusted')),
      task_id text,
      proposal_id text,
      checks text check (checks is null or json_valid(checks)),
      sequence integer not null references records (sequence),
      snapshot_hash text not null,
      recorded_at integer not null,
      unique (item_id, version)
    ) strict`.execute(tx);
  },
};
