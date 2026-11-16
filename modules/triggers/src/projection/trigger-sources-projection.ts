import type { Projection } from '@heynixie/log';
import { triggerDeliveredCodec } from '../record/trigger-delivered-codec';
import type { TriggersTables } from '../types';

export const triggerSourcesProjection: Projection = {
  table: 'trigger_sources',
  keyColumn: 'source_id',
  fold: async (tx, record) => {
    if (record.kind !== 'trigger.delivered') {
      return [];
    }

    const delivered = triggerDeliveredCodec.decode(record.payload);
    const cursor = JSON.stringify(delivered.cursor);

    await tx
      .$extendTables<TriggersTables>()
      .insertInto('trigger_sources')
      .values({ source_id: delivered.source, cursor, updated_sequence: record.sequence })
      .onConflict((conflict) =>
        conflict.column('source_id').doUpdateSet({ cursor, updated_sequence: record.sequence }),
      )
      .execute();

    return [delivered.source];
  },
};
