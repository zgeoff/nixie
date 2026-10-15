import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import type { PartReport } from './types';

// SQLite's quick check of the whole database: ready when it answers ok, and unready with the count
// of problems it found otherwise. The problems name pages and tables, so the report keeps only
// their count.
export async function checkDatabaseIntegrity(db: Kysely<unknown>): Promise<PartReport> {
  const result = await sql<{ readonly quick_check: string }>`PRAGMA quick_check`.execute(db);

  const problems = result.rows.filter((row) => row.quick_check !== 'ok');

  return problems.length === 0
    ? { isReady: true, reason: null }
    : { isReady: false, reason: `the integrity check found ${problems.length} problems` };
}
