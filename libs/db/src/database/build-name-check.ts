import type { RawBuilder } from 'kysely';
import { sql } from 'kysely';

// The field names that point at one record in every record codec and projection table of this
// release: a sequence, a turn's retrieved messages and a decision's on-behalf-of messages. SQLite's
// like ignores case.
const referenceNamePatterns = ['%equence%', '%retrievedmessages%', '%onbehalfof%'];

// A read cursor, a through mark or a held-from mark is a position that every reader compares with
// a sequence, so it stays valid when the record at that position goes.
const markNamePatterns = ['%cursor%', '%through%', '%heldfrom%'];

export function buildNameCheck(name: RawBuilder<unknown>): RawBuilder<unknown> {
  const references = referenceNamePatterns.map((pattern) => sql`${name} like ${pattern}`);
  const marks = markNamePatterns.map((pattern) => sql`${name} like ${pattern}`);

  return sql`((${sql.join(references, sql` or `)}) and not (${sql.join(marks, sql` or `)}))`;
}
