import { spendRouteClearedCodec } from '../pause/spend-route-cleared-codec';
import { spendRouteRestatedCodec } from '../pause/spend-route-restated-codec';
import { spendRouteStoppedCodec } from '../pause/spend-route-stopped-codec';
import type { LogTables, Projection } from '../types';

// One row for each route whose stop stands. A trip or a restatement of a route replaces its row and
// leaves the holds of that route, and a clear removes the row and the holds.
export const spendRouteStopsProjection: Projection = {
  table: 'spend_route_stops',
  keyColumn: 'route_id',
  fold: async (tx, record) => {
    if (record.thread !== null) {
      return [];
    }

    const tables = tx.$extendTables<LogTables>();

    if (record.kind === spendRouteClearedCodec.kind) {
      const payload = spendRouteClearedCodec.decode(record.payload);

      await tables.deleteFrom('spend_route_stops').where('route_id', '=', payload.route).execute();
      await tables.deleteFrom('spend_route_holds').where('route_id', '=', payload.route).execute();

      return [payload.route];
    }

    if (
      record.kind !== spendRouteStoppedCodec.kind &&
      record.kind !== spendRouteRestatedCodec.kind
    ) {
      return [];
    }

    const payload =
      record.kind === spendRouteStoppedCodec.kind
        ? spendRouteStoppedCodec.decode(record.payload)
        : spendRouteRestatedCodec.decode(record.payload);

    const values = {
      route_id: payload.route,
      period: payload.period,
      limit_amount: payload.limit,
      spent_amount: payload.spent,
      at: payload.at,
      resets_at: payload.resetsAt,
      updated_sequence: record.sequence,
    };

    await tables
      .insertInto('spend_route_stops')
      .values(values)
      .onConflict((conflict) => conflict.column('route_id').doUpdateSet(values))
      .execute();

    return [payload.route];
  },
};
