import { readSpendStop, writeSpendRaise } from '@heynixie/spend';
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
        return { state: 'clear' as const };
      }

      const stop = await readSpendStop(context.spend);

      return toSpendStopResponse(stop);
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

      return writeSpendRaise(context.spend, { ...options.input, by: caller.identityID });
    }),
  };
}
