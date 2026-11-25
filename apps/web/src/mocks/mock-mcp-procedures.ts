// oxlint-disable new-cap -- oRPC names a procedure's typed errors by their upper-case codes
import { mockImplementer } from './mock-implementer';
import { requireMockSession } from './require-mock-session';

// The mock holds no MCP server, so a connect answers that none has the ID.
export const mockMcpProcedures = {
  connect: mockImplementer.mcp.connect.handler((options) => {
    requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);
    throw options.errors.SERVER_NOT_FOUND();
  }),

  finishSignIn: mockImplementer.mcp.finishSignIn.handler((options) => {
    requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);
    throw options.errors.SIGN_IN_NOT_FOUND();
  }),
};
