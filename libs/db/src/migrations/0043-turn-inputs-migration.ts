import { sql } from 'kysely';
import type { Migration } from '../types';

export const turnInputsMigration: Migration = {
  name: 'create the turn-input log',
  up: async (tx) => {
    await sql`create table if not exists turn_input_captures (
      capture_id text primary key,
      task_id text not null,
      step_run_id text not null,
      role text not null,
      profile text not null,
      model text not null,
      harness text not null,
      source text not null,
      key_id text,
      sealed_private_key blob,
      state text not null check (state in ('open', 'closed')),
      close_cause text check (close_cause in ('step_end', 'start', 'forget', 'off', 'reset')),
      opened_at integer not null,
      closed_at integer,
      call_frames integer,
      inputs integer not null default 0,
      misses integer not null default 0
    ) strict`.execute(tx);

    await sql`create table if not exists turn_inputs (
      input_id text primary key,
      capture_id text not null references turn_input_captures (capture_id),
      task_id text not null,
      step_run_id text not null,
      writer text not null,
      counter integer not null,
      role text not null,
      profile text not null,
      model text not null,
      harness text not null,
      api text not null,
      endpoint text not null,
      route text not null,
      is_rewritten integer not null check (is_rewritten in (0, 1)),
      upstream_status integer not null,
      bytes integer not null,
      key_id text not null,
      intake_sequence integer not null,
      received_at integer not null,
      taken_at integer not null,
      state text not null check (state in ('writing', 'stored', 'missing', 'removed')),
      removed_cause text check (
        removed_cause in (
          'retention_days', 'retention_bytes', 'forget', 'dropped', 'restore', 'reset'
        )
      ),
      unique (capture_id, writer, counter)
    ) strict`.execute(tx);

    await sql`create index if not exists turn_inputs_by_state_taken
      on turn_inputs (state, taken_at)`.execute(tx);

    await sql`create index if not exists turn_inputs_by_task_sequence
      on turn_inputs (task_id, intake_sequence)`.execute(tx);

    await sql`create index if not exists turn_inputs_by_sequence
      on turn_inputs (intake_sequence)`.execute(tx);

    await sql`create table if not exists turn_input_misses (
      miss_id text primary key,
      capture_id text,
      task_id text not null,
      step_run_id text not null,
      reason text not null check (
        reason in (
          'queue_full', 'spool_full', 'spool_write_failed', 'seal_failed',
          'no_capture_point', 'not_received', 'undecodable', 'capture_closed',
          'intake_failed', 'holds_own_value'
        )
      ),
      count integer not null check (count > 0),
      writer text,
      counter integer,
      created_at integer not null
    ) strict`.execute(tx);

    await sql`create index if not exists turn_input_misses_by_created
      on turn_input_misses (created_at)`.execute(tx);
  },
};
