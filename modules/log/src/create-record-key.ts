import type { KeyStoreTables, Log } from './types';

export interface RecordKey {
  readonly keyID: string;
  readonly key: CryptoKey;
}

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
