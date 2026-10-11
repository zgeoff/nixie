import { sql } from 'kysely';
import type { Migration } from './types';

// Creates the actions projection: one row per queued action with its outcome, its attempt count
// and the time of its next attempt, so a restart resumes the retry schedule where it stopped.
export const actionsMigration: Migration = {
  name: 'create the actions projection',
  up: async (tx) => {
    await sql`create table actions (
      action_id text primary key,
      task_id text not null references tasks (task_id),
      step_key text not null,
      action_hash text not null,
      tool text not null,
      status text not null check (status in ('pending', 'done', 'failed', 'unknown')),
      attempt_count integer not null,
      attempt_open integer not null check (attempt_open in (0, 1)),
      next_attempt_at integer not null,
      reason text,
      queued_sequence integer not null references records (sequence),
      outcome_sequence integer references records (sequence),
      updated_sequence integer not null references records (sequence)
    ) strict`.execute(tx);
    await sql`create index actions_by_status on actions (status, next_attempt_at)`.execute(tx);
    await sql`create index actions_by_hash on actions (task_id, action_hash)`.execute(tx);
  },
};
