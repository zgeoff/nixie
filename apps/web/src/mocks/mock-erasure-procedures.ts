import { mockImplementer } from './mock-implementer';
import { mockViewStore } from './mock-view-store';
import { requireMockSession } from './require-mock-session';

const erasure = mockImplementer.erasure;

export const mockErasureProcedures = {
  readStuck: erasure.readStuck.handler((options) => {
    requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);

    return { stuck: readStuckForgets() };
  }),

  retryStuck: erasure.retryStuck.handler((options) => {
    requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);

    mockViewStore.stuckForgets.delete((query) => query.where((forget) => !forget.staysStuck));

    return { stuck: readStuckForgets() };
  }),
};

function readStuckForgets() {
  return mockViewStore.stuckForgets.all().map((forget) => ({
    kind: forget.kind,
    shortID: forget.shortID,
    openForMs: forget.openForMs,
  }));
}
