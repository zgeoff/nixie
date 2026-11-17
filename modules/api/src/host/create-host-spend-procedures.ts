// oxlint-disable new-cap -- oRPC names a procedure's typed errors by their upper-case codes
import { writeHostSpendRaise } from '@heynixie/spend';
import type { APIContext } from '../types';
import { hostImplementer } from './host-implementer';

export function createHostSpendProcedures(context: APIContext) {
  const spend = hostImplementer.spend;

  return {
    raise: spend.raise.handler((options) => {
      if (context.spend === undefined) {
        throw options.errors.SPEND_NOT_CONFIGURED();
      }

      return writeHostSpendRaise(context.spend, { turns: options.input.turns });
    }),
  };
}
