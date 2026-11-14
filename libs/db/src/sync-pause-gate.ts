import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import { z } from 'zod';
import { closeToOlderReaders } from './close-to-older-readers';
import { pauseMigrationVersion } from './pause-migration-version';
import { readQueryRows } from './read-query-rows';
import { reopenToOlderReaders } from './reopen-to-older-readers';

export async function syncPauseGate(db: Kysely<unknown>): Promise<void> {
  await db.transaction().execute(async (tx) => {
    const tables = await readQueryRows(
      sql`select name from sqlite_master where type = 'table' and name = 'nixie_pause'`,
      tx,
      z.object({ name: z.string() }),
    );

    if (tables.length === 0) {
      return;
    }

    const pauses = await readQueryRows(
      sql`select id from nixie_pause`,
      tx,
      z.object({ id: z.number() }),
    );

    await (pauses.length === 0
      ? reopenToOlderReaders(tx)
      : closeToOlderReaders(tx, pauseMigrationVersion));
  });
}
