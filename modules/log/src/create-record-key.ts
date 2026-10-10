import type { KeyStoreTables, Log } from './types';

interface RecordKey {
  readonly keyID: string;
  readonly key: CryptoKey;
}

// Creates an AES-256-GCM key for one record and writes it to the key store, wrapped by the
// deployment key with AES-KW, under a random ID. It commits before its record, so a failed write
// leaves an unused key and never a record without one.
export async function createRecordKey(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
): Promise<RecordKey> {
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
    'encrypt',
    'decrypt',
  ]);
  const wrapped = await crypto.subtle.wrapKey('raw', key, log.deploymentKey, 'AES-KW');
  const keyID = crypto.randomUUID();

  await log.writer.keys
    .$extendTables<KeyStoreTables>()
    .insertInto('record_keys')
    .values({ key_id: keyID, wrapped: new Uint8Array(wrapped) })
    .execute();
  return { keyID, key };
}
