import type { KeyStoreTables, Log } from './types';

// Reads and unwraps the record keys under keyIDs. A key that the key store no longer holds, because
// a forget or an expiry deleted it, is missing from the map.
export async function findRecordKeys(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  keyIDs: readonly string[],
): Promise<ReadonlyMap<string, CryptoKey>> {
  if (keyIDs.length === 0) {
    return new Map();
  }
  const rows = await log.writer.keys
    .$extendTables<KeyStoreTables>()
    .selectFrom('record_keys')
    .select(['key_id', 'wrapped'])
    .where('key_id', 'in', keyIDs)
    .execute();
  const entries = await Promise.all(
    rows.map(
      async (row) =>
        [
          row.key_id,
          await crypto.subtle.unwrapKey(
            'raw',
            row.wrapped,
            log.deploymentKey,
            'AES-KW',
            { name: 'AES-GCM' },
            false,
            ['encrypt', 'decrypt'],
          ),
        ] as const,
    ),
  );

  return new Map(entries);
}
