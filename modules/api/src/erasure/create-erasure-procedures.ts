// oxlint-disable new-cap -- oRPC names a procedure's typed errors by their upper-case codes
import { requireCaller } from '../memory/require-caller';
import type { APIContext, ErasureStuckPort } from '../types';
import { apiImplementer } from '../utils/api-implementer';

export function createErasureProcedures(context: APIContext) {
  const erasure = apiImplementer.erasure;

  const requireErasure = (buildNotStarted: () => Error): ErasureStuckPort => {
    const port = context.readErasure?.() ?? null;

    if (port === null) {
      throw buildNotStarted();
    }

    return port;
  };

  return {
    readStuck: erasure.readStuck.handler(async (options) => {
      await requireCaller(context, options.context.sessionToken, options.errors.UNAUTHORIZED);

      const port = requireErasure(options.errors.ERASURE_NOT_STARTED);

      return { stuck: [...(await port.readStuck())] };
    }),

    retryStuck: erasure.retryStuck.handler(async (options) => {
      await requireCaller(context, options.context.sessionToken, options.errors.UNAUTHORIZED);

      const port = requireErasure(options.errors.ERASURE_NOT_STARTED);

      return { stuck: [...(await port.retryStuck())] };
    }),
  };
}
