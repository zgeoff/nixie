import type { Log, LogTables } from '@heynixie/log';
import { removeRecordKey } from '@heynixie/log';
import type { ImageTables } from './image-tables';

// An import keeps its own bytes under its own record's key, so a forget of the record it came from
// removes those keys too, and the imported image reads as forgotten with it.
export async function removeImportedImageKeys(
  log: Pick<Log, 'writer'>,
  sourceSequence: number,
): Promise<void> {
  const db = log.writer.db;

  const imports = await db
    .$extendTables<ImageTables>()
    .selectFrom('images')
    .select('sequence')
    .where('source_seq', '=', sourceSequence)
    .where('source', 'in', ['file', 'photo'])
    .execute();

  for (const imported of imports) {
    const record = await db
      .$extendTables<LogTables>()
      .selectFrom('records')
      .select('key_id')
      .where('sequence', '=', imported.sequence)
      .executeTakeFirst();

    if (record?.key_id !== undefined && record.key_id !== null) {
      await removeRecordKey(log, record.key_id);
    }
  }
}
