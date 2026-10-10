import { sql } from 'kysely';
import type { KeyStoreTables, Log } from './types';

// Deletes one record key, which leaves the record's envelope and a gap where its erasable fields
// were. The checkpoint moves the deletion out of the key store's WAL, and secure delete has already
// overwritten the page, so no copy of the key stays in either file.
export async function removeRecordKey(log: Pick<Log, 'writer'>, keyID: string): Promise<void> {
  await log.writer.keys
    .$extendTables<KeyStoreTables>()
    .deleteFrom('record_keys')
    .where('key_id', '=', keyID)
    .execute();
  await sql`pragma wal_checkpoint(truncate)`.execute(log.writer.keys);
}
