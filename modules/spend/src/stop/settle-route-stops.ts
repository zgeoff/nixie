import type { SpendContext } from '../types';
import type { SpendFacts } from './pick-spend-stop';
import { settleRouteStopsInTransaction } from './settle-route-stops-in-transaction';
import { withSettleTransaction } from './with-settle-transaction';

export function settleRouteStops(context: SpendContext, facts: SpendFacts): Promise<void> {
  return withSettleTransaction(context, (tx) => settleRouteStopsInTransaction(tx, context, facts));
}
