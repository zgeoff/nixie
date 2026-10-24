import type { KeyStoreTables, Log, LogTables } from './types';
import { withWriteTransaction } from './with-write-transaction';
import { writeKeyStoreCheckpoint } from './write-key-store-checkpoint';

const chunkSize = 500;

export async function removeThreadKeys(log: Pick<Log, 'writer'>, thread: string): Promise<number> {
  await withWriteTransaction(log.writer, () => Promise.resolve());

  const rows = await log.writer.db
    .$extendTables<LogTables>()
    .selectFrom('records')
    .select('key_id')
    .distinct()
    .where('thread', '=', thread)
    .where('key_id', 'is not', null)
    .execute();

  const keyIDs = rows.flatMap((row) => (row.key_id === null ? [] : [row.key_id]));

  // SQLite caps the parameters of one statement, and a long conversation holds more keys than that.
  for (let start = 0; start < keyIDs.length; start += chunkSize) {
    await log.writer.keys
      .$extendTables<KeyStoreTables>()
      .deleteFrom('record_keys')
      .where('key_id', 'in', keyIDs.slice(start, start + chunkSize))
      .execute();
  }

  await writeKeyStoreCheckpoint(log, null);

  return keyIDs.length;
}
