import type { Transaction } from 'kysely';
import { sql } from 'kysely';
import type { Migration } from './types';

export const memorySubjectChangesMigration: Migration = {
  name: 'add the subject changes of memory proposals and versions',
  up: async (tx) => {
    await createSubjectColumn(tx, { table: 'memory_proposals', column: 'new_subject' });
    await createSubjectColumn(tx, { table: 'memory_versions', column: 'previous_subject' });
  },
};

interface SubjectColumn {
  readonly table: 'memory_proposals' | 'memory_versions';
  readonly column: 'new_subject' | 'previous_subject';
}

async function createSubjectColumn(
  tx: Transaction<unknown>,
  subjectColumn: SubjectColumn,
): Promise<void> {
  const columns = await sql`
    select name from pragma_table_info(${subjectColumn.table})
    where name = ${subjectColumn.column}`.execute(tx);

  if (columns.rows.length === 0) {
    await sql`alter table ${sql.table(subjectColumn.table)}
      add column ${sql.ref(subjectColumn.column)} text`.execute(tx);
  }
}
