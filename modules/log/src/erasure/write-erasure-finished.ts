import { sql } from 'kysely';
import { withWriteTransaction } from '../record/with-write-transaction';
import { writeRecordsInTransaction } from '../record/write-records-in-transaction';
import type { LogTables } from '../types';
import type { ErasureEffects } from './erasure-effects';
import { erasureFinishedCodec } from './erasure-finished-codec';
import type { OpenErasure } from './read-open-erasures';
import type { ErasureEntry, ErasureLogContext } from './types';

// Writes erasure.finished once: a repeat after a crash finds the record and writes nothing.
export function writeErasureFinished(
  context: ErasureLogContext & { readonly effects: Pick<ErasureEffects, 'writeBackupFloor'> },
  erasure: OpenErasure,
  entry: Pick<ErasureEntry, 'writeFinished'>,
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

    await writeRecordsInTransaction(tx, context.log, [
      {
        kind: 'erasure.finished',
        definitions: context.definitions(),
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
