// oxlint-disable new-cap -- oRPC names a procedure's typed errors by their upper-case codes
import { mockImplementer } from './mock-implementer';
import { requireMockSession } from './require-mock-session';

const memory = mockImplementer.memory;

// The mock store keeps no moments, so it refuses every keep and finds no moment the client names.
export const mockMomentProcedures = {
  keepMoment: memory.keepMoment.handler((options) => {
    requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);
    throw options.errors.BAD_SPAN();
  }),

  previewMomentDestroy: memory.previewMomentDestroy.handler((options) => {
    requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);
    throw options.errors.MOMENT_NOT_FOUND();
  }),

  destroyMoment: memory.destroyMoment.handler((options) => {
    requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);
    throw options.errors.MOMENT_NOT_FOUND();
  }),
};
