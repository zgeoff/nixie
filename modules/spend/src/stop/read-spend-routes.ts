import type { RouteTrip, SpendContext } from '../types';
import { collectRouteTrips } from './collect-route-trips';
import { readSpendFacts } from './read-spend-facts';

// Each route that stands at its limit now, from the gateway's status. A gateway that does not answer
// gives none, and the whole-of-nixie stop says so.
export async function readSpendRoutes(context: SpendContext): Promise<readonly RouteTrip[]> {
  const facts = await readSpendFacts(context);

  return facts.status === null ? [] : collectRouteTrips(facts.status, facts.now);
}
