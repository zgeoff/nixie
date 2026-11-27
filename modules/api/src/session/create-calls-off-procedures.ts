// oxlint-disable new-cap -- oRPC names a procedure's typed errors by their upper-case codes
import { requireCaller } from '../memory/require-caller';
import type { APIContext } from '../types';
import { apiImplementer } from '../utils/api-implementer';
import { refuseFeature } from '../utils/require-feature';

// The answers of the call procedures while the voice feature is off: each one checks the session,
// then refuses. The calls module supplies the procedures of a nixie that has it on.
export function createCallsOffProcedures(context: APIContext) {
  return {
    start: apiImplementer.calls.start.handler(async (options) => {
      await requireCaller(context, options.context.sessionToken, options.errors.UNAUTHORIZED);

      refuseFeature('voice', options.errors.FEATURE_OFF);
    }),

    get: apiImplementer.calls.get.handler(async (options) => {
      await requireCaller(context, options.context.sessionToken, options.errors.UNAUTHORIZED);

      refuseFeature('voice', options.errors.FEATURE_OFF);
    }),

    connect: apiImplementer.calls.connect.handler(async (options) => {
      await requireCaller(context, options.context.sessionToken, options.errors.UNAUTHORIZED);

      refuseFeature('voice', options.errors.FEATURE_OFF);
    }),

    hangUp: apiImplementer.calls.hangUp.handler(async (options) => {
      await requireCaller(context, options.context.sessionToken, options.errors.UNAUTHORIZED);

      refuseFeature('voice', options.errors.FEATURE_OFF);
    }),
  };
}
