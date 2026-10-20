import type { Kysely } from 'kysely';
import { sql } from 'kysely';

export interface SubjectCount {
  readonly owner: number;
  readonly shared: number;
  readonly self: number;
}

// How many memory items and memory proposals each subject holds.
export interface MemorySubjectCounts {
  readonly items: SubjectCount;
  readonly proposals: SubjectCount;
}

// Reads how many memory items and proposals each subject holds, in one transaction so both counts
// see the same batches. A row with no subject counts by its kind, as the subjects migration maps
// it, and a database from before memory counts none.
export function readMemorySubjectCounts(db: Kysely<unknown>): Promise<MemorySubjectCounts> {
  return db.transaction().execute(async (tx) => ({
    items: await readTableSubjectCounts(tx, 'memory_items'),
    proposals: await readTableSubjectCounts(tx, 'memory_proposals'),
  }));
}

async function readTableSubjectCounts(
  db: Kysely<unknown>,
  table: 'memory_items' | 'memory_proposals',
): Promise<SubjectCount> {
  const columns = await sql<{ name: string }>`
    select name from pragma_table_info(${table})`.execute(db);

  const names = new Set(columns.rows.map((column) => column.name));

  if (names.size === 0) {
    return { owner: 0, shared: 0, self: 0 };
  }

  const subject = pickSubjectExpression(names);

  const rows = await sql<{ subject: string; count: number }>`
    select ${subject} as subject, count(*) as count from ${sql.table(table)}
    group by 1`.execute(db);

  const counts = new Map(rows.rows.map((row) => [row.subject, row.count]));

  return {
    owner: counts.get('owner') ?? 0,
    shared: counts.get('shared') ?? 0,
    self: counts.get('self') ?? 0,
  };
}

// the subject column, or where a row holds none the subject its kind maps to, as the subjects
// migration maps it
function pickSubjectExpression(names: ReadonlySet<string>) {
  if (names.has('subject')) {
    return sql`coalesce(subject, case kind when 'self' then 'self' else 'owner' end)`;
  }

  return names.has('kind')
    ? sql`case kind when 'self' then 'self' else 'owner' end`
    : sql.lit('owner');
}
