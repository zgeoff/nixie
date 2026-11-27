// oxlint-disable new-cap -- oRPC names a procedure's typed errors by their upper-case codes
import { requireCaller } from '../memory/require-caller';
import type { APIContext } from '../types';
import { apiImplementer } from '../utils/api-implementer';

// The answers of the device procedures while the devices feature is off: each one checks the
// session, then refuses. The devices module supplies the procedures of a nixie that has it on.
export function createDevicesOffProcedures(context: APIContext) {
  return {
    register: apiImplementer.devices.register.handler(async (options) => {
      await requireCaller(context, options.context.sessionToken, options.errors.UNAUTHORIZED);

      throw options.errors.FEATURE_OFF({ data: { feature: 'devices' } });
    }),

    resize: apiImplementer.devices.resize.handler(async (options) => {
      await requireCaller(context, options.context.sessionToken, options.errors.UNAUTHORIZED);

      throw options.errors.FEATURE_OFF({ data: { feature: 'devices' } });
    }),

    pageError: apiImplementer.devices.pageError.handler(async (options) => {
      await requireCaller(context, options.context.sessionToken, options.errors.UNAUTHORIZED);

      throw options.errors.FEATURE_OFF({ data: { feature: 'devices' } });
    }),

    pageEvent: apiImplementer.devices.pageEvent.handler(async (options) => {
      await requireCaller(context, options.context.sessionToken, options.errors.UNAUTHORIZED);

      throw options.errors.FEATURE_OFF({ data: { feature: 'devices' } });
    }),

    pageData: apiImplementer.devices.pageData.handler(async (options) => {
      await requireCaller(context, options.context.sessionToken, options.errors.UNAUTHORIZED);

      throw options.errors.FEATURE_OFF({ data: { feature: 'devices' } });
    }),

    // The device page asks this first, with or without a session, so it answers before the session
    // check: the page then shows the feature-off page instead of an enrolment form that no code
    // can fill.
    setCapability: apiImplementer.devices.setCapability.handler((options) => {
      throw options.errors.FEATURE_OFF({ data: { feature: 'devices' } });
    }),

    readImage: apiImplementer.devices.readImage.handler(async (options) => {
      await requireCaller(context, options.context.sessionToken, options.errors.UNAUTHORIZED);

      throw options.errors.FEATURE_OFF({ data: { feature: 'devices' } });
    }),
  };
}
