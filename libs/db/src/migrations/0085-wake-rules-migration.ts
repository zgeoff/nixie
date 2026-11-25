import { sql } from 'kysely';
import type { Migration } from '../types';

export const wakeRulesMigration: Migration = {
  name: 'create the tables of the mail wake rules, their windows and the matches held for a later wake',
  up: async (tx) => {
    await sql`create table if not exists wake_rules (
      rule_id text primary key,
      short_id text not null unique,
      mailbox text not null,
      match text not null,
      target_kind text not null,
      target_task_id text not null,
      set_by text not null,
      expires_at integer,
      window_ms integer not null,
      origin text not null,
      created_at integer not null,
      ended_at integer,
      end_reason text,
      updated_sequence integer not null
    ) strict`.execute(tx);

    await sql`create index if not exists wake_rules_by_mailbox
      on wake_rules (mailbox, ended_at)`.execute(tx);

    await sql`create table if not exists wake_rule_windows (
      rule_id text primary key,
      last_wake_at integer not null,
      updated_sequence integer not null
    ) strict`.execute(tx);

    await sql`create table if not exists wake_held (
      held_key text primary key,
      rule_id text not null,
      target_task_id text not null,
      arrived_seq integer not null
    ) strict`.execute(tx);

    await sql`create index if not exists wake_held_by_target
      on wake_held (target_task_id, arrived_seq)`.execute(tx);
  },
};
