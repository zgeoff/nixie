import type { ContractClient } from '@heynixie/contract';
import { clientHeaderName, liveStreamTiming } from '@heynixie/contract';
import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import { makeWatchedFetch } from './make-watched-fetch';

export function buildBrowserClient(): ContractClient {
  return createORPCClient<ContractClient>(
    new RPCLink({
      fetch: makeWatchedFetch({ idleMs: liveStreamTiming.idleLimitMs }),
      headers: { [clientHeaderName]: 'web' },
      url: () => new URL('/rpc', globalThis.location.href),
    }),
  );
}
