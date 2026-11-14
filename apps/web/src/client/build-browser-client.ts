import type { ContractClient } from '@heynixie/contract';
import { clientHeaderName } from '@heynixie/contract';
import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import { makeWatchedFetch } from './make-watched-fetch';

// The API sends a keepalive into a quiet live stream every 5 s, so a stream that misses three in a
// row is dead.
const streamIdleMs = 15_000;

export function buildBrowserClient(): ContractClient {
  return createORPCClient<ContractClient>(
    new RPCLink({
      fetch: makeWatchedFetch({ idleMs: streamIdleMs }),
      headers: { [clientHeaderName]: 'web' },
      url: () => new URL('/rpc', globalThis.location.href),
    }),
  );
}
