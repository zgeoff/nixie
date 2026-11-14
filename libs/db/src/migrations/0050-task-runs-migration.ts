import { sql } from 'kysely';
import type { Migration } from '../types';

export const taskRunsMigration: Migration = {
  name: 'create the task runs of a task',
  up: async (tx) => {
    await sql`create table if not exists task_runs (
      run_id text primary key,
      task_id text not null,
      opened_sequence integer not null references records (sequence),
      started_at integer not null,
      definition_id text,
      opened text not null,
      report_id text,
      ended_sequence integer references records (sequence),
      ended_at integer,
      ended text,
      check ((ended_sequence is null) = (ended is null)),
      check ((ended_sequence is null) = (ended_at is null))
    ) strict`.execute(tx);

    await sql`create unique index if not exists task_runs_open
      on task_runs (task_id) where ended_sequence is null`.execute(tx);

    await sql`create index if not exists task_runs_by_task
      on task_runs (task_id, opened_sequence)`.execute(tx);

    await sql`create index if not exists task_runs_ended
      on task_runs (definition_id, ended_sequence) where ended_sequence is not null`.execute(tx);

    await sql`create index if not exists task_runs_report
      on task_runs (report_id) where report_id is not null`.execute(tx);
  },
};
