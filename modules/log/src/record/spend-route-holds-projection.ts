import { spendRouteHeldCodec } from '../pause/spend-route-held-codec';
import type { LogTables, Projection } from '../types';

// One row for each task that waits on a stopped route. The row only holds the task while the
// route's stop stands.
export const spendRouteHoldsProjection: Projection = {
  table: 'spend_route_holds',
  keyColumn: 'task_id',
  fold: async (tx, record) => {
    if (record.thread !== null || record.kind !== spendRouteHeldCodec.kind) {
      return [];
    }

    const payload = spendRouteHeldCodec.decode(record.payload);

    const values = {
      task_id: payload.taskID,
      route_id: payload.route,
      updated_sequence: record.sequence,
    };

    await tx
      .$extendTables<LogTables>()
      .insertInto('spend_route_holds')
      .values(values)
      .onConflict((conflict) => conflict.column('task_id').doUpdateSet(values))
      .execute();

    return [payload.taskID];
  },
};
