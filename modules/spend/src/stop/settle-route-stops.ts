import {
  spendRouteClearedCodec,
  spendRouteRestatedCodec,
  spendRouteStoppedCodec,
  spendWaitNoticeCodec,
  withWriteTransaction,
  writeRecordsInTransaction,
} from '@heynixie/log';
import type { RouteTrip, SpendContext } from '../types';
import { claimSettleOrder } from './claim-settle-order';
import { collectRouteTrips } from './collect-route-trips';
import { pickRouteMove } from './pick-route-move';
import type { SpendFacts } from './pick-spend-stop';
import { readSpendRouteHolds } from './read-spend-route-holds';
import { readSpendRouteStops } from './read-spend-route-stops';

// Brings the log's route stops in line with the gateway's routes. A trip writes the notice to the
// owner once, and a clear writes a wait notice for each task that waited. A restated stop sends no
// notice and keeps its holds. Facts of a gateway that did not answer, or read before a settle's facts, move nothing.
export async function settleRouteStops(context: SpendContext, facts: SpendFacts): Promise<void> {
  if (facts.status === null) {
    return;
  }

  const trips = collectRouteTrips(facts.status, facts.statusAtMs);

  await withWriteTransaction(context.log.writer, async (tx) => {
    if (!claimSettleOrder(context, facts.order)) {
      return;
    }

    const standing = await readSpendRouteStops(tx);

    const move = pickRouteMove(standing, trips, facts.statusAtMs);
    const definitions = context.definitions();

    for (const clear of move.clears) {
      const holds = await readSpendRouteHolds(tx, clear.route);

      await writeRecordsInTransaction(tx, context.log, [
        ...holds.map((hold) => ({
          kind: spendWaitNoticeCodec.kind,
          definitions,
          thread: hold.taskID,
          payload: spendWaitNoticeCodec.encode({
            taskID: hold.taskID,
            sinceMs: hold.sinceMs,
            untilMs: facts.now,
          }),
        })),
        {
          kind: spendRouteClearedCodec.kind,
          definitions,
          payload: spendRouteClearedCodec.encode({ route: clear.route, reason: clear.reason }),
        },
      ]);
    }

    await writeRecordsInTransaction(tx, context.log, [
      ...move.trips.map((trip) => ({
        kind: spendRouteStoppedCodec.kind,
        definitions,
        payload: spendRouteStoppedCodec.encode(toStopPayload(trip)),
      })),
      ...move.restates.map((trip) => ({
        kind: spendRouteRestatedCodec.kind,
        definitions,
        payload: spendRouteRestatedCodec.encode(toStopPayload(trip)),
      })),
    ]);
  });
}

function toStopPayload(trip: RouteTrip) {
  return {
    route: trip.route,
    period: trip.period,
    limit: trip.limit,
    spent: trip.spent,
    at: trip.at,
    resetsAt: trip.resetsAt,
  };
}
