import type { RawBuilder } from 'kysely';
import { sql } from 'kysely';

// The field names that hold a record sequence in every record codec and projection table of this
// release: a sequence, a read cursor, a recalled-through or held-from mark, a turn's retrieved
// messages and a decision's on-behalf-of messages. SQLite's like ignores case.
const sequenceNamePatterns = [
  '%equence%',
  '%cursor%',
  '%through%',
  '%heldfrom%',
  '%retrievedmessages%',
  '%onbehalfof%',
];

export function buildNameCheck(name: RawBuilder<unknown>): RawBuilder<unknown> {
  return sql`(${sql.join(
    sequenceNamePatterns.map((pattern) => sql`${name} like ${pattern}`),
    sql` or `,
  )})`;
}
