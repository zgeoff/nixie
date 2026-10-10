import { sql } from 'kysely';
import { KeyStoreBusyError } from './key-store-busy-error';
import type { KeyStoreTables, Log } from './types';
import { withWriteTransaction } from './with-write-transaction';

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
  const result = await sql<CheckpointResult>`pragma wal_checkpoint(truncate)`.execute(
    log.writer.keys,
  );
  const checkpoint = result.rows.at(0);

  if (
    checkpoint === undefined ||
    checkpoint.busy !== 0 ||
    checkpoint.log !== checkpoint.checkpointed
  ) {
    throw new KeyStoreBusyError(keyID);
  }
}

interface CheckpointResult {
  readonly busy: number;
  readonly log: number;
  readonly checkpointed: number;
}
