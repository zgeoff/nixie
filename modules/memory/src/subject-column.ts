import { sql } from 'kysely';

// A row's subject as a query filters on it, with the subject its kind gives when the release
// before wrote the row with none, as getRowSubject reads it.
export const subjectColumn = sql`coalesce(subject, case kind when 'self' then 'self' else 'owner' end)`;
