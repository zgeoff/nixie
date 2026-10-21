import type { Kysely } from 'kysely';
import { sql } from 'kysely';

export async function withReadSnapshot<T>(db: Kysely<unknown>, run: () => Promise<T>): Promise<T> {
  await sql`begin`.execute(db);

  try {
    // SQLite takes a deferred transaction's snapshot at its first read.
    await sql`select count(*) from sqlite_schema`.execute(db);

    return await run();
  } finally {
    await sql`rollback`.execute(db);
  }
}
