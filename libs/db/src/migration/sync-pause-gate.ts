import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import { z } from 'zod';
import { readQueryRows } from '../read-query-rows';
import { closeToOlderReaders } from './close-to-older-readers';
import { pauseMigrationVersion } from './pause-migration-version';
import { reopenToOlderReaders } from './reopen-to-older-readers';
import { spendMigrationVersion } from './spend-migration-version';

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
      sql`select cause from nixie_pause`,
      tx,
      z.object({ cause: z.string() }),
    );

    const [pause] = pauses;

    if (pause === undefined) {
      await reopenToOlderReaders(tx);

      return;
    }

    // A spending pause holds the database closed to the release before the spending stop's tables.
    const reader = pause.cause === 'spending' ? spendMigrationVersion : pauseMigrationVersion;

    await closeToOlderReaders(tx, reader);
  });
}
