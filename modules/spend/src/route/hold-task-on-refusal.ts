import { readSpendFacts } from '../stop/read-spend-facts';
import { settleRouteStops } from '../stop/settle-route-stops';
import type { SpendContext } from '../types';
import { holdTaskOnRoute } from './hold-task-on-route';

// A step failed on a route, which may be the gateway's refusal at the route's limit. It reads the
// gateway's count, stops the route when the count shows it, and holds the task when the route
// stands stopped, so the failure counts no step error and the task retries after the clear.
export async function holdTaskOnRefusal(
  context: SpendContext,
  taskID: string,
  route: string,
): Promise<boolean> {
  const facts = await readSpendFacts(context);

  await settleRouteStops(context, facts);

  return holdTaskOnRoute(context, taskID, route);
}
