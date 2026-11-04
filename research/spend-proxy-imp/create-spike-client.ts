import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
// @boundaries-ignore a spike imports the code it measures
import type { ContractClient } from '../../libs/contract/src/index.ts';
// @boundaries-ignore a spike imports the code it measures
import { clientHeaderName } from '../../libs/contract/src/index.ts';

export function createSpikeClient(origin: string, token: string | null): ContractClient {
  return createORPCClient<ContractClient>(
    new RPCLink({
      url: `${origin}/rpc`,
      headers:
        token === null
          ? { [clientHeaderName]: 'spike' }
          : { [clientHeaderName]: 'spike', authorization: `Bearer ${token}` },
    }),
  );
}
