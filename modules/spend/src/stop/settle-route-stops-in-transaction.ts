import { createShortID } from '@heynixie/db';
import type { WriteTransaction } from '@heynixie/log';
import {
  spendProviderClearedCodec,
  spendProviderRestatedCodec,
  spendProviderStoppedCodec,
  spendRouteClearedCodec,
  spendRouteRestatedCodec,
  spendRouteStoppedCodec,
  spendWaitNoticeCodec,
  writeRecordsInTransaction,
} from '@heynixie/log';
import type { ProviderTrip, RouteTrip, SpendContext } from '../types';
import { claimSettleOrder } from './claim-settle-order';
import { collectProviderTrips } from './collect-provider-trips';
import { collectRouteTrips } from './collect-route-trips';
import type { SpendFacts } from './pick-spend-stop';
import { pickStopMove } from './pick-stop-move';
import { readSpendProviderHolds } from './read-spend-provider-holds';
import { readSpendProviderStops } from './read-spend-provider-stops';
import { readSpendRouteHolds } from './read-spend-route-holds';
import { readSpendRouteStops } from './read-spend-route-stops';

// Brings the log's route stops and provider stops in line with the gateway's counts. A trip writes
// the notice to the owner once, and a clear writes a wait notice for each task that waited. Both
// kinds of stop claim one place in line, because a settle marks every place so far as settled.
export async function settleRouteStopsInTransaction(
  tx: WriteTransaction,
  context: SpendContext,
  facts: SpendFacts,
): Promise<void> {
  if (facts.status === null) {
    return;
  }

  const roomReason = facts.roomReason ?? 'raised';

  const routeStops = await readSpendRouteStops(tx);
  const providerStops = await readSpendProviderStops(tx);

  const routeTrips = collectRouteTrips(facts.status, facts.statusAtMs);
  const providerTrips = collectProviderTrips(facts.status, facts.statusAtMs);

  const routeMove = pickStopMove({
    field: 'route',
    standing: routeStops,
    trips: routeTrips,
    nowMs: facts.statusAtMs,
    roomReason,
  });

  const providerMove = pickStopMove({
    field: 'provider',
    standing: providerStops,
    trips: providerTrips,
    nowMs: facts.statusAtMs,
    roomReason,
  });

  const count =
    routeMove.clears.length +
    routeMove.trips.length +
    routeMove.restates.length +
    providerMove.clears.length +
    providerMove.trips.length +
    providerMove.restates.length;

  const isWriting = count > 0;

  if (!claimSettleOrder(context, facts.order, isWriting) || !isWriting) {
    return;
  }

  const definitions = context.definitions();

  for (const clear of routeMove.clears) {
    const holds = await readSpendRouteHolds(tx, clear.key);

    await writeRecordsInTransaction(tx, context.log, [
      ...buildWaitNotices(holds, facts.now, definitions),
      {
        kind: spendRouteClearedCodec.kind,
        definitions,
        payload: spendRouteClearedCodec.encode({ route: clear.key, reason: clear.reason }),
      },
    ]);
  }

  for (const clear of providerMove.clears) {
    const holds = await readSpendProviderHolds(tx, clear.key);

    await writeRecordsInTransaction(tx, context.log, [
      ...buildWaitNotices(holds, facts.now, definitions),
      {
        kind: spendProviderClearedCodec.kind,
        definitions,
        payload: spendProviderClearedCodec.encode({
          provider: clear.key,
          reason: clear.reason,
        }),
      },
    ]);
  }

  await writeRecordsInTransaction(tx, context.log, [
    ...routeMove.trips.map((trip) => ({
      kind: spendRouteStoppedCodec.kind,
      definitions,
      payload: spendRouteStoppedCodec.encode(toRouteStopPayload(trip)),
    })),
    ...routeMove.restates.map((trip) => ({
      kind: spendRouteRestatedCodec.kind,
      definitions,
      payload: spendRouteRestatedCodec.encode(toRouteStopPayload(trip)),
    })),
    ...providerMove.trips.map((trip) => ({
      kind: spendProviderStoppedCodec.kind,
      definitions,
      payload: spendProviderStoppedCodec.encode(toProviderStopPayload(trip)),
    })),
    ...providerMove.restates.map((trip) => ({
      kind: spendProviderRestatedCodec.kind,
      definitions,
      payload: spendProviderRestatedCodec.encode(toProviderStopPayload(trip)),
    })),
  ]);
}

interface Hold {
  readonly taskID: string;
  readonly sinceMs: number;
}

function buildWaitNotices(
  holds: readonly Hold[],
  nowMs: number,
  definitions: ReturnType<SpendContext['definitions']>,
) {
  return holds.map((hold) => ({
    kind: spendWaitNoticeCodec.kind,
    definitions,
    thread: hold.taskID,
    payload: spendWaitNoticeCodec.encode({
      shortID: createShortID(),
      taskID: hold.taskID,
      sinceMs: hold.sinceMs,
      untilMs: Math.max(nowMs, hold.sinceMs),
    }),
  }));
}

function toRouteStopPayload(trip: RouteTrip) {
  return {
    route: trip.route,
    period: trip.period,
    limit: trip.limit,
    spent: trip.spent,
    at: trip.at,
    resetsAt: trip.resetsAt,
  };
}

function toProviderStopPayload(trip: ProviderTrip) {
  return {
    provider: trip.provider,
    routes: [...trip.routes],
    period: trip.period,
    limit: trip.limit,
    spent: trip.spent,
    at: trip.at,
    resetsAt: trip.resetsAt,
  };
}
