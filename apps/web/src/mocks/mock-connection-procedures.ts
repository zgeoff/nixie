// oxlint-disable new-cap -- oRPC names a procedure's typed errors by their upper-case codes
import { mockImplementer } from './mock-implementer';
import { requireMockSession } from './require-mock-session';

// The mock holds no Google connection: each read answers empty, and each action answers that
// nixie has not started its connections.
export const mockConnectionProcedures = {
  readSetup: mockImplementer.connections.readSetup.handler((options) => {
    requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);

    return { steps: [], client: null };
  }),

  registerClient: mockImplementer.connections.registerClient.handler((options) => {
    requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);
    throw options.errors.CONNECTIONS_NOT_STARTED();
  }),

  setPicker: mockImplementer.connections.setPicker.handler((options) => {
    requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);
    throw options.errors.CONNECTIONS_NOT_STARTED();
  }),

  removeClient: mockImplementer.connections.removeClient.handler((options) => {
    requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);
    throw options.errors.CONNECTIONS_NOT_STARTED();
  }),

  startConsent: mockImplementer.connections.startConsent.handler((options) => {
    requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);
    throw options.errors.CONNECTIONS_NOT_STARTED();
  }),

  finishConsent: mockImplementer.connections.finishConsent.handler((options) => {
    requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);
    throw options.errors.CONNECTIONS_NOT_STARTED();
  }),

  list: mockImplementer.connections.list.handler((options) => {
    requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);

    return [];
  }),

  forget: mockImplementer.connections.forget.handler((options) => {
    requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);
    throw options.errors.CONNECTIONS_NOT_STARTED();
  }),

  readForgetStatus: mockImplementer.connections.readForgetStatus.handler((options) => {
    requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);
    throw options.errors.CONNECTIONS_NOT_STARTED();
  }),
};
