import type { KeyStoreTables, Log } from './types';

export interface RecordKey {
  readonly keyID: string;
  readonly key: CryptoKey;
}

// Creates an AES-256-GCM key and writes it to the key store, wrapped by the deployment key with
// AES-KW, under a random ID: a fresh one per record, or the random ID a caller keys by, such as a
// memory item's. It commits before its record, so a failed write never leaves a record keyless.
export async function createRecordKey(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  keyID: string = crypto.randomUUID(),
): Promise<RecordKey> {
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
    'encrypt',
    'decrypt',
  ]);

  const wrapped = await crypto.subtle.wrapKey('raw', key, log.deploymentKey, 'AES-KW');

  await log.writer.keys
    .$extendTables<KeyStoreTables>()
    .insertInto('record_keys')
    .values({ key_id: keyID, wrapped: new Uint8Array(wrapped) })
    .execute();

  return { keyID, key };
}
