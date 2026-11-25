import { withWriteTransaction } from '@heynixie/log';
import type { SpendContext } from '../types';
import type { SpendFacts } from './pick-spend-stop';
import { settleRouteStopsInTransaction } from './settle-route-stops-in-transaction';

export function settleRouteStops(context: SpendContext, facts: SpendFacts): Promise<void> {
  return withWriteTransaction(context.log.writer, (tx) =>
    settleRouteStopsInTransaction(tx, context, facts),
  );
}
