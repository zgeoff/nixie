import type { LogTables } from '@heynixie/log';
import { removeRecordKey, writeKeyStoreCheckpoint } from '@heynixie/log';
import { sql } from 'kysely';
import { findHeldRecordKeys } from './find-held-record-keys';
import type { MemoryTables, StoreParts } from './types';

// Removes the key of each saved offer's record that an earlier release's crash, between the
// version's commit and the key's removal, left behind, so a forget of the saved item leaves the
// offered text unreadable.
export async function removeSavedOfferKeys(parts: StoreParts): Promise<void> {
  const log = parts.context.log;

  const rows = await log.writer.db
    .$extendTables<MemoryTables & LogTables>()
    .selectFrom('memory_versions')
    .innerJoin('records', (join) =>
      join.on((eb) =>
        eb(
          'records.sequence',
          '=',
          sql<number>`json_extract(memory_versions.checks, '$.offer.sequence')`,
        ),
      ),
    )
    .select('records.key_id')
    .where('records.kind', '=', 'memory.image_offered')
    .where('records.key_id', 'is not', null)
    .execute();

  const keyIDs = [...new Set(rows.flatMap((row) => (row.key_id === null ? [] : [row.key_id])))];

  const left = await findHeldRecordKeys(log, keyIDs);

  // one key removal at a time, because each checkpoints the key store
  await left.reduce(
    (removed, keyID) => removed.then(() => removeRecordKey(log, keyID)),
    Promise.resolve(),
  );

  // a removal whose checkpoint a reader blocked left no row to find, so the checkpoint runs again
  if (keyIDs.length > 0) {
    await writeKeyStoreCheckpoint(log, null);
  }
}
