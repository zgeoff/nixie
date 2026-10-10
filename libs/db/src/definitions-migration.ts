import { sql } from 'kysely';
import type { Migration } from './types';

// Creates the definitions tables: each persona under its version, each snapshot under its hash
// with the revision that first brought it as its label, and one row per seed. The newest seed
// holds the definitions in force.
export const definitionsMigration: Migration = {
  name: 'create the definitions tables',
  up: async (tx) => {
    await sql`create table personas (
      persona_version text primary key,
      instructions text not null
    ) strict`.execute(tx);

    await sql`create table definition_snapshots (
      snapshot_hash text primary key,
      persona_version text not null references personas (persona_version),
      policy_hash text not null,
      form text not null check (json_valid(form)),
      label text not null,
      created_at integer not null
    ) strict`.execute(tx);

    await sql`create table definition_seeds (
      seed integer primary key,
      seeded_at integer not null,
      source_id text not null,
      source_kind text not null check (source_kind in ('bucket', 'git', 'path')),
      revision text not null,
      content_hash text not null,
      format_version integer not null,
      snapshot_hash text not null references definition_snapshots (snapshot_hash),
      record_sequence integer not null unique references records (sequence)
    ) strict`.execute(tx);
  },
};
