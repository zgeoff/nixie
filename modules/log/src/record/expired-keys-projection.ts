import { erasureStartedCodec } from '../erasure/erasure-started-codec';
import type { LogTables, Projection } from '../types';

const chunkSize = 100;

// The keys that an expiry named, which tells a key that left by age from one that left by a forget.
export const expiredKeysProjection: Projection = {
  table: 'expired_keys',
  keyColumn: 'key_id',
  fold: async (tx, record) => {
    if (record.kind !== 'erasure.started' || record.payload['kind'] !== 'expiry') {
      return [];
    }

    const started = erasureStartedCodec.decode(record.payload);

    if (!('ids' in started.capture.keys)) {
      return [];
    }

    const keyIDs = started.capture.keys.ids;

    for (let start = 0; start < keyIDs.length; start += chunkSize) {
      await tx
        .$extendTables<LogTables>()
        .insertInto('expired_keys')
        .values(
          keyIDs.slice(start, start + chunkSize).map((keyID) => ({
            key_id: keyID,
            started_sequence: record.sequence,
          })),
        )
        .onConflict((conflict) => conflict.column('key_id').doNothing())
        .execute();
    }

    return [];
  },
};
