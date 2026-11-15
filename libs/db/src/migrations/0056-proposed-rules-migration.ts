import { sql } from 'kysely';
import type { Migration } from '../types';

// The family check widens to the proposed rule and the mandate, by a rebuild of the table, because
// SQLite cannot change a check in place. The gap tables are projections that the log folds into
// rows, and a log that holds no such records leaves them empty.
export const proposedRulesMigration: Migration = {
  name: 'add the proposed rule and mandate families and the gap tables',
  up: async (tx) => {
    await sql`create table proposals_next (
      proposal_id text primary key,
      short_id text not null,
      family text not null check (
        family in ('action', 'memory', 'skill', 'rule_change', 'proposed_rule', 'mandate')
      ),
      kind text not null check (kind in ('action', 'memory_write', 'internal_change')),
      risk_class text not null check (risk_class in ('routine', 'always_ask', 'lifting')),
      action_hash text not null,
      rule_hash text,
      cause text not null,
      task_id text,
      thread text,
      created_sequence integer not null,
      created_at integer not null,
      lapses_at integer not null,
      deadline_at integer,
      state text not null check (
        state in ('pending', 'deferred', 'approved', 'declined', 'lapsed', 'withdrawn')
      ),
      used_by text,
      defer_generation integer not null default 0,
      defer_until integer,
      return_at integer,
      answered_by text
    ) strict`.execute(tx);

    await sql`insert into proposals_next (
      proposal_id, short_id, family, kind, risk_class, action_hash, rule_hash, cause, task_id,
      thread, created_sequence, created_at, lapses_at, deadline_at, state, used_by,
      defer_generation, defer_until, return_at, answered_by
    ) select
      proposal_id, short_id, family, kind, risk_class, action_hash, rule_hash, cause, task_id,
      thread, created_sequence, created_at, lapses_at, deadline_at, state, used_by,
      defer_generation, defer_until, return_at, answered_by
    from proposals`.execute(tx);

    await sql`drop table proposals`.execute(tx);
    await sql`alter table proposals_next rename to proposals`.execute(tx);

    await sql`create index proposals_by_state_and_lapse on proposals (state, lapses_at)`.execute(
      tx,
    );

    await sql`create index proposals_by_state_and_return on proposals (state, return_at)`.execute(
      tx,
    );

    await sql`create index proposals_by_short_id on proposals (short_id)`.execute(tx);

    await sql`create table if not exists gap_answers (
      proposal_id text primary key,
      group_hash text not null,
      answer text not null check (answer in ('approved', 'declined')),
      answered_at integer not null,
      answered_sequence integer not null
    ) strict`.execute(tx);

    await sql`create index if not exists gap_answers_by_group
      on gap_answers (group_hash, answered_at)`.execute(tx);

    await sql`create table if not exists gap_groups (
      group_hash text primary key,
      quiet_until integer,
      proposal_id text,
      checked_sequence integer
    ) strict`.execute(tx);

    await sql`create index if not exists gap_groups_by_proposal on gap_groups (proposal_id)`.execute(
      tx,
    );
  },
};
