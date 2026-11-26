import type { PeriodStore } from '../types';
import { buildFreshStore } from './build-fresh-store';
import type { LimitTable } from './limit-table';
import type { Version3Store } from './types';

// A store of version 3 keeps its routes and sandboxes, and every provider starts at zero, because a
// route count can hold the total that the move from version 2 copied into it. A refusal of a route
// that the config dropped names no provider, so it goes.
export function buildVersion4Store(
  earlier: Version3Store,
  nowMs: number,
  zone: string,
  table: LimitTable,
): PeriodStore {
  const fresh = buildFreshStore(nowMs, zone, [], Object.keys(table.providers));

  return {
    ...fresh,
    lost: earlier.lost === true,
    routes: earlier.routes,
    sandboxes: Object.fromEntries(
      Object.entries(earlier.sandboxes).map(([name, held]) => [
        name,
        { ...held, lastRefusal: moveRefusal(held.lastRefusal, table) },
      ]),
    ),
    ...(earlier.lastLimitRevision === undefined
      ? {}
      : { lastLimitRevision: earlier.lastLimitRevision }),
  };
}

function moveRefusal(
  refusal: Version3Store['sandboxes'][string]['lastRefusal'],
  limits: LimitTable,
): PeriodStore['sandboxes'][string]['lastRefusal'] {
  if (refusal === null || !Object.hasOwn(limits.providerOf, refusal.route)) {
    return null;
  }

  const provider = limits.providerOf[refusal.route];

  return provider === undefined ? null : { ...refusal, provider };
}
