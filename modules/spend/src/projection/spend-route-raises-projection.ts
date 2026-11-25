import type { Projection } from '@heynixie/log';
import { spendLimitRaisedCodec } from '../record/spend-limit-raised-codec';
import type { SpendTables } from '../types';

// One row per route, which holds the day of its latest raise of dollars. A raise of the same route
// on a later day replaces the row, and no limit reads an earlier day's.
export const spendRouteRaisesProjection: Projection = {
  table: 'spend_route_raises',
  keyColumn: 'route_id',
  fold: async (tx, record) => {
    if (record.thread !== null || record.kind !== spendLimitRaisedCodec.kind) {
      return [];
    }

    const payload = spendLimitRaisedCodec.decode(record.payload);

    if (payload.route === undefined || payload.dollars === undefined) {
      return [];
    }

    const values = {
      route_id: payload.route,
      start: payload.start,
      dollars: payload.dollars,
      raised_by: payload.by,
      at: record.recordedAt.getTime(),
      updated_sequence: record.sequence,
    };

    await tx
      .$extendTables<SpendTables>()
      .insertInto('spend_route_raises')
      .values(values)
      .onConflict((conflict) => conflict.column('route_id').doUpdateSet(values))
      .execute();

    return [payload.route];
  },
};
