import { sql } from 'kysely';
import type { Migration } from './types';

// Creates the tasks and timers projections and the leases table. The state check lists all 8
// design states, because a SQLite check changes only with a table rebuild. Leases are not a
// projection: a claim or a renewal changes a lease without a record, and a rebuild leaves them be.
export const tasksMigration: Migration = {
  name: 'create the tasks, timers and leases',
  up: async (tx) => {
    await sql`create table tasks (
      task_id text primary key,
      is_conversation integer not null check (is_conversation in (0, 1)),
      state text not null check (state in (
        'ready', 'running', 'waiting', 'paused', 'stopped', 'failed', 'done', 'closed'
      )),
      read_cursor integer not null,
      last_inbox_sequence integer not null,
      committed_steps integer not null,
      started_step_key text,
      step_errors integer not null,
      claimable_at integer not null,
      session_boundary text,
      created_sequence integer not null references records (sequence),
      updated_sequence integer not null references records (sequence)
    ) strict`.execute(tx);
    await sql`create index tasks_by_state on tasks (state, claimable_at)`.execute(tx);

    await sql`create table timers (
      timer_id text primary key,
      task_id text not null references tasks (task_id),
      due_at integer not null,
      set_sequence integer not null references records (sequence),
      fired_at integer,
      fired_sequence integer references records (sequence),
      check ((fired_at is null) = (fired_sequence is null))
    ) strict`.execute(tx);
    await sql`create index timers_by_due on timers (fired_at, due_at)`.execute(tx);

    // one row per piece of work a runner ever claimed; the generation only rises
    await sql`create table leases (
      kind text not null check (kind in ('task', 'action')),
      work_id text not null,
      holder text,
      expires_at integer,
      epoch integer not null,
      generation integer not null check (generation > 0),
      primary key (kind, work_id),
      check ((holder is null) = (expires_at is null))
    ) strict`.execute(tx);
  },
};
