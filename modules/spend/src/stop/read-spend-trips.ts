import type { ProviderTrip, RouteTrip, SpendContext } from '../types';
import { collectProviderTrips } from './collect-provider-trips';
import { collectRouteTrips } from './collect-route-trips';
import { readSpendFacts } from './read-spend-facts';

export interface SpendTrips {
  readonly routes: readonly RouteTrip[];
  readonly providers: readonly ProviderTrip[];
}

// Each route and each provider that stands at its limit now, from the gateway's status. A gateway
// that does not answer gives none, and the whole-of-nixie stop says so.
export async function readSpendTrips(context: SpendContext): Promise<SpendTrips> {
  const facts = await readSpendFacts(context);

  return facts.status === null
    ? { routes: [], providers: [] }
    : {
        routes: collectRouteTrips(facts.status, facts.now),
        providers: collectProviderTrips(facts.status, facts.now),
      };
}
