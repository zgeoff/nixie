// oxlint-disable new-cap -- oRPC names a procedure's typed errors by their upper-case codes
import { mcpStore } from './mcp-store';
import { mockImplementer } from './mock-implementer';
import { requireMockSession } from './require-mock-session';

// The mock holds the servers that `mcpStore` holds. A finish succeeds for the state that names the server of the last connect. A connect answers the sign-in URL of a server
// that is in, and a server that is not answers that none has the ID.
export const mockMcpProcedures = {
  listServers: mockImplementer.mcp.listServers.handler((options) => {
    requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);

    return [...mcpStore.servers];
  }),

  connect: mockImplementer.mcp.connect.handler((options) => {
    requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);

    const found = mcpStore.servers.find((server) => server.server === options.input.server);

    if (found === undefined) {
      throw options.errors.SERVER_NOT_FOUND();
    }

    if (found.state === 'held') {
      throw options.errors.SERVER_NOT_ADDED();
    }

    const reason = mcpStore.discoveryFailures.get(found.server);

    if (reason !== undefined) {
      throw options.errors.DISCOVERY_FAILED({ data: { reason } });
    }

    mcpStore.connects.push({ server: found.server, origin: options.input.origin });

    return { authorizeURL: `/mock-mcp/authorize?server=${found.server}` };
  }),

  finishSignIn: mockImplementer.mcp.finishSignIn.handler((options) => {
    requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);

    const started = mcpStore.connects.at(-1);

    // the state of a sign-in that a connect started is the server's ID; any other state is unknown
    if (started === undefined || options.input.state !== started.server) {
      throw options.errors.SIGN_IN_NOT_FOUND();
    }

    mcpStore.finishes.push(options.input.state);

    return { server: started.server };
  }),

  readNotices: mockImplementer.mcp.readNotices.handler((options) => {
    requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);

    return { notices: [] };
  }),
};
