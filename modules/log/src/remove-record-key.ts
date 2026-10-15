import type { KeyStoreTables, Log } from './types';
import { withWriteTransaction } from './with-write-transaction';
import { writeKeyStoreCheckpoint } from './write-key-store-checkpoint';

// Deletes one record key, which leaves the record's envelope and a gap where its erasable fields
// were. A process that lost the writer role deletes nothing. The checkpoint must move every frame
// out of the key store's WAL, and secure delete has overwritten the page, so no copy stays on disk.
export async function removeRecordKey(log: Pick<Log, 'writer'>, keyID: string): Promise<void> {
  await withWriteTransaction(log.writer, () => Promise.resolve());

  await log.writer.keys
    .$extendTables<KeyStoreTables>()
    .deleteFrom('record_keys')
    .where('key_id', '=', keyID)
    .execute();

  await writeKeyStoreCheckpoint(log, keyID);
}
