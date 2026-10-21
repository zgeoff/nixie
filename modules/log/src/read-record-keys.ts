import type { KeyStoreTables, Log } from './types';

export async function readRecordKeys(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  keyIDs: readonly string[],
): Promise<ReadonlyMap<string, CryptoKey | null>> {
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
          await crypto.subtle
            .unwrapKey(
              'raw',
              row.wrapped,
              log.deploymentKey,
              'AES-KW',
              { name: 'AES-GCM' },
              false,
              ['encrypt', 'decrypt'],
            )
            .catch(() => null),
        ] as const,
    ),
  );

  return new Map(entries);
}
