import { sql } from 'kysely';

export const subjectColumn = sql`coalesce(subject, case kind when 'self' then 'self' else 'owner' end)`;
