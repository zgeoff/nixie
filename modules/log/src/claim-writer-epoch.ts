import type { Kysely } from 'kysely';
import { sql } from 'kysely';

// Raises the writer epoch by one in a single transaction and returns the new value. The table
// predates every migration, because the epoch rises before the first one runs. BEGIN IMMEDIATE
// orders the raise against every write transaction: one that began before it commits first.
export function claimWriterEpoch(db: Kysely<unknown>): Promise<number> {
  return db.transaction().execute(async (tx) => {
    await sql`create table if not exists writer_epoch (
      id integer primary key check (id = 1),
      epoch integer not null
    ) strict`.execute(tx);
    const result = await sql<{ epoch: number }>`insert into writer_epoch (id, epoch) values (1, 1)
      on conflict (id) do update set epoch = epoch + 1
      returning epoch`.execute(tx),
      [row] = result.rows;

    if (row === undefined) {
      throw new Error('the writer epoch raise returned no row');
    }
    return row.epoch;
  });
}
