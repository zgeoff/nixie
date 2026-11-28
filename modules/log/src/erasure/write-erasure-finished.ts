import { sql } from 'kysely';
import { writeKeyStoreCheckpoint } from '../key/write-key-store-checkpoint';
import { withWriteTransaction } from '../record/with-write-transaction';
import { writeRecordsInTransaction } from '../record/write-records-in-transaction';
import type { KeyStoreTables, Log, LogTables } from '../types';
import type { ErasureEffects } from './erasure-effects';
import { erasureFinishedCodec } from './erasure-finished-codec';
import type { OpenErasure } from './read-open-erasures';
import type { ErasureEntry, ErasureLogContext } from './types';

// Writes erasure.finished once: a repeat after a crash finds the record and writes nothing. Before
// it writes, it removes the keys of any record that the target gained since the last scan, in the
// same transaction, so no write can land between that scan and the finish.
export function writeErasureFinished(
  context: ErasureLogContext & { readonly effects: Pick<ErasureEffects, 'writeBackupFloor'> },
  erasure: OpenErasure,
  entry: Pick<ErasureEntry, 'writeFinished' | 'readLateKeyIDs'>,
): Promise<void> {
  const started = erasure.started;

  return withWriteTransaction(context.log.writer, async (tx) => {
    const existing = await tx
      .$extendTables<LogTables>()
      .selectFrom('records')
      .select('sequence')
      .where('kind', '=', 'erasure.finished')
      .where(sql`json_extract(payload, '$.erasureID')`, '=', started.erasureID)
      .executeTakeFirst();

    if (existing !== undefined) {
      return;
    }

    const late = await entry.readLateKeyIDs(
      tx,
      { kind: started.kind, targetID: started.targetID, version: started.version },
      started.capture,
    );

    await removeKeyIDs(context.log, late);

    await writeRecordsInTransaction(tx, context.log, [
      {
        kind: 'erasure.finished',
        definitions: context.definitions(),
        ...(erasure.thread === null ? {} : { thread: erasure.thread }),
        payload: erasureFinishedCodec.encode({
          erasureID: started.erasureID,
          kind: started.kind,
          targetID: started.targetID,
          shortID: started.shortID,
          by: started.by,
          removedKeys: started.keyCount,
        }),
      },
    ]);

    await entry.writeFinished(tx, {
      target: { kind: started.kind, targetID: started.targetID, version: started.version },
      removedKeys: started.keyCount,
    });

    await context.effects.writeBackupFloor(tx);
  });
}

const chunkSize = 500;

async function removeKeyIDs(log: Pick<Log, 'writer'>, keyIDs: readonly string[]): Promise<void> {
  if (keyIDs.length === 0) {
    return;
  }

  const keys = log.writer.keys.$extendTables<KeyStoreTables>();

  for (let start = 0; start < keyIDs.length; start += chunkSize) {
    await keys
      .deleteFrom('record_keys')
      .where('key_id', 'in', keyIDs.slice(start, start + chunkSize))
      .execute();
  }

  await writeKeyStoreCheckpoint(log, null);
}
