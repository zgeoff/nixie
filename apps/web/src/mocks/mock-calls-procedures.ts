// oxlint-disable new-cap -- oRPC names a procedure's typed errors by their upper-case codes
import { mockImplementer } from './mock-implementer';
import { requireMockSession } from './require-mock-session';

// The mock nixie has voice calls off, so a start is refused and no call exists to connect or end.
export const mockCallsProcedures = {
  start: mockImplementer.calls.start.handler((options) => {
    requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);
    throw options.errors.VOICE_OFF();
  }),
  connect: mockImplementer.calls.connect.handler((options) => {
    requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);
    throw options.errors.CALL_NOT_FOUND();
  }),
  hangUp: mockImplementer.calls.hangUp.handler((options) => {
    requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);
    throw options.errors.CALL_NOT_FOUND();
  }),
};
