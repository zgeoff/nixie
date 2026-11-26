import {
  spendProviderHeldCodec,
  spendRouteHeldCodec,
  withWriteTransaction,
  writeRecordsInTransaction,
} from '@heynixie/log';
import { readSpendProviderHolds } from '../stop/read-spend-provider-holds';
import { readSpendProviderStops } from '../stop/read-spend-provider-stops';
import { readSpendRouteHolds } from '../stop/read-spend-route-holds';
import { readSpendRouteStops } from '../stop/read-spend-route-stops';
import type { SpendContext } from '../types';

// Holds the task while the stop of its route or of its route's provider stands, and answers whether
// it holds the task now. A task that a standing stop already holds writes nothing, and one whose
// stop cleared is held again by a stop that still stands.
export function holdTaskOnRoute(
  context: SpendContext,
  taskID: string,
  route: string,
): Promise<boolean> {
  return withWriteTransaction(context.log.writer, async (tx) => {
    const routeStops = await readSpendRouteStops(tx);
    const providerStops = await readSpendProviderStops(tx);

    const isRouteStopped = routeStops.some((stop) => stop.route === route);
    const providerStop = providerStops.find((stop) => stop.routes.includes(route));

    if (!isRouteStopped && providerStop === undefined) {
      return false;
    }

    const routeHolds = isRouteStopped ? await readSpendRouteHolds(tx, route) : [];

    const providerHolds =
      providerStop === undefined ? [] : await readSpendProviderHolds(tx, providerStop.provider);

    if ([...routeHolds, ...providerHolds].some((hold) => hold.taskID === taskID)) {
      return true;
    }

    const held = isRouteStopped
      ? { kind: spendRouteHeldCodec.kind, payload: spendRouteHeldCodec.encode({ taskID, route }) }
      : {
          kind: spendProviderHeldCodec.kind,
          payload: spendProviderHeldCodec.encode({
            taskID,
            provider: providerStop?.provider ?? '',
          }),
        };

    await writeRecordsInTransaction(tx, context.log, [
      { ...held, definitions: context.definitions() },
    ]);

    return true;
  });
}
