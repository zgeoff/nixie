import type { KeyStoreTables, Log } from './types';
import { withWriteTransaction } from './with-write-transaction';
import { writeKeyStoreCheckpoint } from './write-key-store-checkpoint';

export async function removeRecordKey(log: Pick<Log, 'writer'>, keyID: string): Promise<void> {
  await withWriteTransaction(log.writer, () => Promise.resolve());

  await log.writer.keys
    .$extendTables<KeyStoreTables>()
    .deleteFrom('record_keys')
    .where('key_id', '=', keyID)
    .execute();

  await writeKeyStoreCheckpoint(log, keyID);
}
