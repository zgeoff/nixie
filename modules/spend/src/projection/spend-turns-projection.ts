import type { Projection } from '@heynixie/log';
import type { SpendTurnKind } from '../record/spend-record-kind';
import { writeTurnBucket } from './write-turn-bucket';

// Each model call writes one of these 2 records, so a record is a turn. The count sits in buckets of
// 15 minutes, because every zone's offset is a multiple of 15 minutes, so a day or a month in any
// zone is a sum of whole buckets.
export const spendTurnKinds: readonly SpendTurnKind[] = ['model.turn_ended', 'worker.turn_ended'];

const turnKinds: ReadonlySet<string> = new Set<string>(spendTurnKinds);

export const spendTurnsProjection: Projection = {
  table: 'spend_turns',
  keyColumn: 'bucket_start',
  fold: async (tx, record) => {
    if (!turnKinds.has(record.kind)) {
      return [];
    }

    const key = await writeTurnBucket(tx, {
      sequence: record.sequence,
      recordedAtMs: record.recordedAt.getTime(),
    });

    return [key];
  },
};
