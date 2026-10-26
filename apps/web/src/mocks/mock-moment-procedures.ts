// oxlint-disable new-cap -- oRPC names a procedure's typed errors by their upper-case codes
import { mockImplementer } from './mock-implementer';
import { requireMockSession } from './require-mock-session';

const memory = mockImplementer.memory;

// The mock store holds no moments, so every moment the client names is missing.
export const mockMomentProcedures = {
  previewMomentDestroy: memory.previewMomentDestroy.handler((options) => {
    requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);
    throw options.errors.MOMENT_NOT_FOUND();
  }),

  destroyMoment: memory.destroyMoment.handler((options) => {
    requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);
    throw options.errors.MOMENT_NOT_FOUND();
  }),
};
