import { sql } from 'kysely';
import type { Migration } from '../types';

export const taskDefinitionsMigration: Migration = {
  name: 'bind each task definition to one task',
  up: async (tx) => {
    const definitionID = await sql`
      select name from pragma_table_info('tasks') where name = 'definition_id'`.execute(tx);

    if (definitionID.rows.length === 0) {
      await sql`alter table tasks add column definition_id text`.execute(tx);
    }

    const definitionHash = await sql`
      select name from pragma_table_info('tasks') where name = 'definition_hash'`.execute(tx);

    if (definitionHash.rows.length === 0) {
      await sql`alter table tasks add column definition_hash text`.execute(tx);
    }

    await sql`create unique index if not exists tasks_definition
      on tasks (definition_id) where definition_id is not null`.execute(tx);
  },
};
