import type { Projection } from '@heynixie/log';
import { parseRefusalRecord } from './parse-refusal-record';
import type { APITables } from './types';

// One row per channel and external ID that nixie refused: when it last wrote a refusal for it. The
// time comes from the record's payload, never the clock, so a rebuild gives the live rows.
export const refusalsProjection: Projection = {
  table: 'refusals',
  keyColumn: 'refusal_key',
  fold: async (tx, record) => {
    const refusal = parseRefusalRecord(record);

    if (refusal === null) {
      return [];
    }
    const refusalKey = `${refusal.channel}:${refusal.externalID}`;

    await tx
      .$extendTables<APITables>()
      .insertInto('refusals')
      .values({
        refusal_key: refusalKey,
        refused_at: refusal.refusedAt,
        refused_sequence: record.sequence,
      })
      .onConflict((conflict) =>
        conflict.column('refusal_key').doUpdateSet((eb) => ({
          refused_at: eb.ref('excluded.refused_at'),
          refused_sequence: eb.ref('excluded.refused_sequence'),
        })),
      )
      .execute();
    return [refusalKey];
  },
};
