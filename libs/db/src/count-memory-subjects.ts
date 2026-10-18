import type { Kysely } from 'kysely';
import { sql } from 'kysely';

// How many memory items and memory proposals each subject holds.
export interface MemorySubjectCounts {
  readonly items: SubjectCount;
  readonly proposals: SubjectCount;
}

export interface SubjectCount {
  readonly owner: number;
  readonly shared: number;
  readonly self: number;
}

// Counts the memory items and proposals of each subject. A database from before subjects counts
// each self-note kind as self and every other row as owner, as the subjects migration maps them,
// and a database from before memory counts none.
export async function countMemorySubjects(db: Kysely<unknown>): Promise<MemorySubjectCounts> {
  return {
    items: await countTableSubjects(db, 'memory_items'),
    proposals: await countTableSubjects(db, 'memory_proposals'),
  };
}

async function countTableSubjects(
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

// the subject column, or the subject a kind column maps to, as the subjects migration maps it
function pickSubjectExpression(names: ReadonlySet<string>) {
  if (names.has('subject')) {
    return sql.ref('subject');
  }

  return names.has('kind')
    ? sql`case kind when 'self' then 'self' else 'owner' end`
    : sql.lit('owner');
}
