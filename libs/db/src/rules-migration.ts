import { sql } from 'kysely';
import type { Migration } from './types';

export const rulesMigration: Migration = {
  name: 'create the rule store',
  up: async (tx) => {
    await sql`create table if not exists rule_versions (
      rule_hash text primary key,
      rule text not null
    ) strict`.execute(tx);

    await sql`create table if not exists rules (
      rule_id text primary key,
      revision integer not null,
      rule_hash text references rule_versions (rule_hash),
      origin text not null check (origin in ('definitions', 'nixie')),
      created_at integer not null,
      updated_at integer not null
    ) strict`.execute(tx);

    await sql`create table if not exists rule_revisions (
      rule_id text not null references rules (rule_id),
      revision integer not null,
      rule_hash text references rule_versions (rule_hash),
      created_at integer not null,
      primary key (rule_id, revision)
    ) strict`.execute(tx);

    await sql`create table if not exists definition_rules (
      rule_id text primary key,
      rule_hash text not null references rule_versions (rule_hash),
      path text not null
    ) strict`.execute(tx);

    await sql`create table if not exists seeded_rules (
      rule_id text primary key,
      rule_hash text not null references rule_versions (rule_hash)
    ) strict`.execute(tx);

    await sql`create table if not exists runtime_rules (
      change_id text primary key,
      rule_id text not null,
      rule_hash text references rule_versions (rule_hash),
      state text not null check (state in ('in_force', 'adopted', 'superseded', 'retired')),
      base_hash text references rule_versions (rule_hash),
      definitions_hash text references rule_versions (rule_hash),
      changed_by text not null check (changed_by in ('owner', 'nixie')),
      reason text not null,
      changed_at integer not null,
      updated_at integer not null
    ) strict`.execute(tx);

    await sql`create unique index if not exists runtime_rules_in_force
      on runtime_rules (rule_id) where state = 'in_force'`.execute(tx);

    await sql`create table if not exists snapshot_rules (
      snapshot_hash text not null references definition_snapshots (snapshot_hash),
      rule_id text not null,
      revision integer not null,
      rule_hash text not null references rule_versions (rule_hash),
      change_id text references runtime_rules (change_id),
      primary key (snapshot_hash, rule_id)
    ) strict`.execute(tx);

    await sql`create table if not exists rule_fires (
      rule_id text primary key,
      last_fired_at integer not null
    ) strict`.execute(tx);
  },
};
