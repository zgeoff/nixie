import { sql } from 'kysely';
import type { Migration } from '../types';

// The trigger tables are projections that the log folds into rows, so a log that holds no trigger
// records leaves them empty. trigger_keys has no conflict clause: a second write of one key fails.
export const triggersMigration: Migration = {
  name: 'add the trigger tables',
  up: async (tx) => {
    await sql`create table if not exists trigger_sources (
      source_id text primary key,
      cursor text,
      updated_sequence integer not null
    ) strict`.execute(tx);

    await sql`create table if not exists trigger_keys (
      source_key text primary key,
      sequence integer not null
    ) strict`.execute(tx);

    await sql`create table if not exists trigger_definitions (
      definition_id text primary key,
      source_id text not null,
      definition_hash text,
      target text not null,
      trigger text not null,
      after integer not null,
      updated_sequence integer not null
    ) strict`.execute(tx);

    await sql`create index if not exists trigger_definitions_by_source
      on trigger_definitions (source_id)`.execute(tx);
  },
};
