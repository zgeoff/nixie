import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import type { PartReport } from './types';

// The database part of liveness: the database answers a query.
export async function checkDatabase(db: Kysely<unknown>): Promise<PartReport> {
  await sql`SELECT 1`.execute(db);

  return { isReady: true, reason: null };
}
