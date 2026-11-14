import type { RawBuilder } from 'kysely';
import { sql } from 'kysely';

// The names of the payload fields and projection columns that hold a record sequence: a plain
// sequence, a read cursor, a recalled-through mark and a held-from mark. SQLite's like ignores case.
const sequenceNamePatterns = ['%equence%', '%cursor%', '%through%', '%heldfrom%'];

export function buildNameCheck(name: RawBuilder<unknown>): RawBuilder<unknown> {
  return sql`(${sql.join(
    sequenceNamePatterns.map((pattern) => sql`${name} like ${pattern}`),
    sql` or `,
  )})`;
}
