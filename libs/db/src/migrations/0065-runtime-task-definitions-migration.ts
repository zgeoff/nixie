import { sql } from 'kysely';
import type { Migration } from '../types';

// Both tables are projections that the log folds into rows, so a log that holds no definition
// records leaves them empty. The partial index holds each definition to one change in force.
export const runtimeTaskDefinitionsMigration: Migration = {
  name: 'add the runtime task definitions',
  up: async (tx) => {
    await sql`create table if not exists runtime_task_definitions (
      change_id text primary key,
      short_id text not null,
      definition_id text not null,
      operation text not null,
      definition_hash text,
      previous_hash text,
      base_hash text,
      definitions_hash text,
      replaces text,
      undoes text,
      caller text not null,
      state text not null,
      state_cause text,
      changed_sequence integer not null,
      updated_sequence integer not null
    ) strict`.execute(tx);

    await sql`create unique index if not exists runtime_task_definitions_by_short_id
      on runtime_task_definitions (short_id)`.execute(tx);

    await sql`create unique index if not exists runtime_task_definitions_in_force
      on runtime_task_definitions (definition_id) where state = 'in_force'`.execute(tx);

    await sql`create table if not exists task_definition_exports (
      export_id text primary key,
      branch text not null,
      state text,
      pull_request_number integer,
      pull_request_url text,
      attempt_started_sequence integer,
      updated_sequence integer not null
    ) strict`.execute(tx);
  },
};
