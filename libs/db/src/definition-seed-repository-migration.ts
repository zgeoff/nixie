import { sql } from 'kysely';
import type { Migration } from './types';

export const definitionSeedRepositoryMigration: Migration = {
  name: 'add the repository that each definitions seed came from',
  up: async (tx) => {
    const columns = await sql`
      select name from pragma_table_info('definition_seeds')
      where name = 'source_repository'`.execute(tx);

    if (columns.rows.length === 0) {
      await sql`alter table definition_seeds add column source_repository text`.execute(tx);
    }
  },
};
