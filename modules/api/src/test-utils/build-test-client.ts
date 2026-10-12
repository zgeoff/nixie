import type { ContractClient } from '@heynixie/contract';
import { clientHeaderName } from '@heynixie/contract';
import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';

// An RPC client of the API at url, with the client header every call needs. A token makes it the
// device that holds that session token; without one, it is signed out.
export function buildTestClient(url: string, token?: string): ContractClient {
  return createORPCClient<ContractClient>(
    new RPCLink({
      url: `${url}/rpc`,
      headers: {
        [clientHeaderName]: 'test',
        ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
      },
    }),
  );
}
