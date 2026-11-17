import type { Projection } from '@heynixie/log';
import { sql } from 'kysely';
import type { SpendTurnKind } from '../record/spend-record-kind';
import type { SpendTables } from '../types';

const spendBucketMs = 15 * 60 * 1000;

// Each model call writes one of these 2 records, so a record is a turn. The count sits in buckets of
// 15 minutes, because every zone's offset is a multiple of 15 minutes, so a day or a month in any
// zone is a sum of whole buckets.
const turnKinds: ReadonlySet<string> = new Set<SpendTurnKind>([
  'model.turn_ended',
  'worker.turn_ended',
]);

export const spendTurnsProjection: Projection = {
  table: 'spend_turns',
  keyColumn: 'bucket_start',
  fold: async (tx, record) => {
    if (!turnKinds.has(record.kind)) {
      return [];
    }

    const bucket = Math.floor(record.recordedAt.getTime() / spendBucketMs) * spendBucketMs;

    await tx
      .$extendTables<SpendTables>()
      .insertInto('spend_turns')
      .values({ bucket_start: bucket, turns: 1 })
      .onConflict((conflict) =>
        conflict.column('bucket_start').doUpdateSet({ turns: sql`turns + 1` }),
      )
      .execute();

    return [String(bucket)];
  },
};
