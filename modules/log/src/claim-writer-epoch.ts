import { readQueryRows } from '@heynixie/db';
import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import invariant from 'tiny-invariant';
import { z } from 'zod';

export function claimWriterEpoch(db: Kysely<unknown>): Promise<number> {
  // BEGIN IMMEDIATE queues this transaction behind every write transaction that began before it.
  return db.transaction().execute(async (tx) => {
    // The table sits outside the migrations, because the epoch rises before the first one runs.
    await sql`create table if not exists writer_epoch (
      id integer primary key check (id = 1),
      epoch integer not null
    ) strict`.execute(tx);

    const [row] = await readQueryRows(
      sql`insert into writer_epoch (id, epoch) values (1, 1)
        on conflict (id) do update set epoch = epoch + 1
        returning epoch`,
      tx,
      z.object({ epoch: z.number() }),
    );

    invariant(row);

    return row.epoch;
  });
}
