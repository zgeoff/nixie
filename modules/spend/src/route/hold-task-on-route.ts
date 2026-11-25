import {
  spendRouteHeldCodec,
  withWriteTransaction,
  writeRecordsInTransaction,
} from '@heynixie/log';
import { readSpendRouteHolds } from '../stop/read-spend-route-holds';
import { readSpendRouteStops } from '../stop/read-spend-route-stops';
import type { SpendContext } from '../types';

// Holds the task while its route's stop stands, and answers whether it holds the task now. A step
// that a route refused, or that finds its route stopped, calls it, so the claim filter keeps the
// task's next claim until the route's stop clears. A route with no standing stop holds nothing.
export function holdTaskOnRoute(
  context: SpendContext,
  taskID: string,
  route: string,
): Promise<boolean> {
  return withWriteTransaction(context.log.writer, async (tx) => {
    const stops = await readSpendRouteStops(tx);

    if (!stops.some((stop) => stop.route === route)) {
      return false;
    }

    const holds = await readSpendRouteHolds(tx, route);

    if (holds.some((hold) => hold.taskID === taskID)) {
      return true;
    }

    await writeRecordsInTransaction(tx, context.log, [
      {
        kind: spendRouteHeldCodec.kind,
        definitions: context.definitions(),
        payload: spendRouteHeldCodec.encode({ taskID, route }),
      },
    ]);

    return true;
  });
}
