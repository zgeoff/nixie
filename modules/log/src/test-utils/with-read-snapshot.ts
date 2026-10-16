import type { Kysely } from 'kysely';
import { sql } from 'kysely';

// Runs the callback while the database's one connection holds a read snapshot, so every read on
// that connection misses a commit from another connection until the callback settles, as it does
// when a commit publishes late. The snapshot ends even when the callback throws.
export async function withReadSnapshot<T>(db: Kysely<unknown>, run: () => Promise<T>): Promise<T> {
  await sql`begin`.execute(db);

  try {
    // a deferred transaction takes its snapshot at its first read
    await sql`select count(*) from sqlite_schema`.execute(db);

    return await run();
  } finally {
    await sql`rollback`.execute(db);
  }
}
