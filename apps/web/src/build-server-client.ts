import type { ContractClient } from '@heynixie/contract';
import { sessionCookieName } from '@heynixie/contract';
import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import { getCookie } from '@tanstack/react-start/server';
import { buildForwardHeaders } from './build-forward-headers';

// The client the Start server renders with. Start scopes getCookie to the request it is serving,
// so one client serves every request and each call forwards the cookie of its own request.
export function buildServerClient(apiURL: string): ContractClient {
  return createORPCClient<ContractClient>(
    new RPCLink({
      headers: () => buildForwardHeaders(getCookie(sessionCookieName)),
      url: `${apiURL}/rpc`,
    }),
  );
}
