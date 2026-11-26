import invariant from 'tiny-invariant';
import type { RouteCount } from '../types';
import { buildEmptyRoute } from './build-fresh-store';
import { toMicros } from './to-micros';
import type { LegacyPeriod, LegacyStore, Version3Store } from './types';

// The store of version 3 that an older store moves through first. A count of one total starts every
// route at zero, and a version 2 store gives every route its whole count of the period under way,
// which never reopens a limit. The lost mark and the sandboxes carry over.
export function buildVersion3Store(
  legacy: LegacyStore,
  nowMs: number,
  zone: string,
  routeIDs: readonly string[],
): Version3Store {
  const fresh = Object.fromEntries(routeIDs.map((id) => [id, buildEmptyRoute(nowMs, zone)]));
  const lost = legacy.lost ? { lost: true as const } : {};

  if (legacy.kind === 'total') {
    return { version: 3, ...lost, routes: fresh, sandboxes: {} };
  }

  return {
    version: 3,
    ...lost,
    routes: Object.fromEntries(
      routeIDs.map((routeID) => [
        routeID,
        {
          day: carryCount(fresh[routeID]?.day, legacy.day),
          month: carryCount(fresh[routeID]?.month, legacy.month),
        },
      ]),
    ),
    sandboxes: Object.fromEntries(
      Object.entries(legacy.sandboxes).map(([name, held]) => [
        name,
        {
          micros: toMicros(held.dollars),
          tokens: held.tokens,
          limit: held.limit,
          lastRefusal: null,
          limitRevision: 0,
        },
      ]),
    ),
  };
}

// The earlier count joins the period that is under way, and an earlier period has ended.
function carryCount(current: RouteCount | undefined, earlier: LegacyPeriod): RouteCount {
  invariant(current, 'a fresh store holds each route');

  if (earlier.start !== current.start) {
    return current;
  }

  return {
    ...current,
    micros: toMicros(earlier.dollars),
    raise: earlier.raise?.dollars ?? null,
    trippedAt: earlier.trippedAt ?? null,
  };
}
