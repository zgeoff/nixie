import type { ContractClient } from '@heynixie/contract';
import { clientHeaderName } from '@heynixie/contract';
import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';

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
