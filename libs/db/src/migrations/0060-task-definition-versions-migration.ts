import { sql } from 'kysely';
import type { Migration } from '../types';

export const taskDefinitionVersionsMigration: Migration = {
  name: 'add the task definition versions',
  up: async (tx) => {
    await sql`create table if not exists task_definition_versions (
      definition_hash text primary key,
      definition_id text not null,
      form text not null,
      files text not null
    ) strict`.execute(tx);
  },
};
