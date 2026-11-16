import type { Projection } from '@heynixie/log';
import { triggerFiredCodec, triggerSkippedCodec } from '@heynixie/tasks';
import type { TriggersTables } from '../types';
import { buildSourceKey } from '../utils/build-source-key';

// One row per fire or skip. A plain insert: a second write of one key fails its transaction.
export const triggerKeysProjection: Projection = {
  table: 'trigger_keys',
  keyColumn: 'source_key',
  fold: async (tx, record) => {
    const db = tx.$extendTables<TriggersTables>();

    if (record.kind !== 'trigger.fired' && record.kind !== 'trigger.skipped') {
      return [];
    }

    const fire =
      record.kind === 'trigger.fired'
        ? triggerFiredCodec.decode(record.payload)
        : triggerSkippedCodec.decode(record.payload);

    const sourceKey = buildSourceKey(fire.source, fire.dedupeKey);

    await db
      .insertInto('trigger_keys')
      .values({ source_key: sourceKey, sequence: record.sequence })
      .execute();

    return [sourceKey];
  },
};
