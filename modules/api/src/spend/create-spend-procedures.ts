import {
  readSpendCounts,
  readSpendStop,
  readSpendTrips,
  writeSpendCountSet,
  writeSpendRaise,
} from '@heynixie/spend';
import { requireCaller } from '../memory/require-caller';
import type { APIContext } from '../types';
import { apiImplementer } from '../utils/api-implementer';
import { toSpendStopResponse } from './to-spend-stop-response';

// A deployment with no spendStop has no stop to read and no limit to raise, and its answers say so
// without calling a gateway.
export function createSpendProcedures(context: APIContext) {
  const spend = apiImplementer.spend;

  return {
    read: spend.read.handler(async (options) => {
      await requireCaller(context, options.context.sessionToken, options.errors.UNAUTHORIZED);

      if (context.spend === undefined) {
        return { state: 'clear' as const, routes: [], providers: [] };
      }

      const stop = await readSpendStop(context.spend);
      const trips = await readSpendTrips(context.spend);

      return toSpendStopResponse(stop, trips);
    }),

    counts: spend.counts.handler(async (options) => {
      await requireCaller(context, options.context.sessionToken, options.errors.UNAUTHORIZED);

      if (context.spend === undefined) {
        return { providers: [], routes: [], display: null };
      }

      return readSpendCounts(context.spend);
    }),

    raise: spend.raise.handler(async (options) => {
      const caller = await requireCaller(
        context,
        options.context.sessionToken,
        options.errors.UNAUTHORIZED,
      );

      if (context.spend === undefined) {
        return { state: 'clear' as const };
      }

      const input = options.input;

      return writeSpendRaise(context.spend, {
        start: input.start,
        ...(input.route === undefined ? {} : { route: input.route }),
        ...(input.provider === undefined ? {} : { provider: input.provider }),
        ...(input.dollars === undefined ? {} : { dollars: input.dollars }),
        ...(input.turns === undefined ? {} : { turns: input.turns }),
        by: caller.identityID,
      });
    }),

    setCount: spend.setCount.handler(async (options) => {
      const caller = await requireCaller(
        context,
        options.context.sessionToken,
        options.errors.UNAUTHORIZED,
      );

      if (context.spend === undefined) {
        return { state: 'clear' as const };
      }

      const input = options.input;

      return writeSpendCountSet(context.spend, {
        target:
          input.route === undefined
            ? { kind: 'provider', id: input.provider ?? '' }
            : { kind: 'route', id: input.route },
        period: input.period,
        start: input.start,
        dollars: input.dollars,
        by: caller.identityID,
      });
    }),
  };
}
