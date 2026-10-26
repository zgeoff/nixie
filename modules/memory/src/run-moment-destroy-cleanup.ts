import type { LogTables } from '@heynixie/log';
import { removeRecordKey, withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import { momentDestroyedCodec } from './moment-destroyed-codec';
import type { MomentDestroyContext, MomentTables } from './moment-types';

// Every step is safe to run twice, so the store's start finishes a destroy that a crash cut short.
export async function runMomentDestroyCleanup(
  context: MomentDestroyContext,
  momentID: string,
): Promise<void> {
  const log = context.log;
  const db = log.writer.db.$extendTables<MomentTables & LogTables>();

  const keys = await db
    .selectFrom('moment_texts')
    .innerJoin('records', 'records.sequence', 'moment_texts.sequence')
    .select('records.key_id')
    .where('moment_texts.moment_id', '=', momentID)
    .execute();

  for (const key of keys) {
    if (key.key_id !== null) {
      await removeRecordKey(log, key.key_id);
    }
  }

  await context.cleanupSessions({ momentID });

  await withWriteTransaction(log.writer, async (tx) => {
    const row = await tx
      .$extendTables<MomentTables>()
      .selectFrom('moments')
      .select(['state', 'version'])
      .where('moment_id', '=', momentID)
      .executeTakeFirst();

    if (row?.state !== 'destroying') {
      return;
    }

    await writeRecordsInTransaction(tx, log, [
      {
        kind: 'moment_destroyed',
        definitions: context.definitions(),
        payload: momentDestroyedCodec.encode({ momentID, version: row.version, stage: 'done' }),
      },
    ]);
  });
}
