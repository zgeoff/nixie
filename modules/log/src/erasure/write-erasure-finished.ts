import { sql } from 'kysely';
import { withWriteTransaction } from '../record/with-write-transaction';
import { writeRecordsInTransaction } from '../record/write-records-in-transaction';
import type { LogTables } from '../types';
import { erasureFinishedCodec } from './erasure-finished-codec';
import type { OpenErasure } from './read-open-erasures';
import type { ErasureLogContext } from './types';

// Writes erasure.finished once: a repeat after a crash finds the record and writes nothing.
export function writeErasureFinished(
  context: ErasureLogContext,
  erasure: OpenErasure,
  removedKeys: number,
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
          removedKeys,
        }),
      },
    ]);
  });
}
