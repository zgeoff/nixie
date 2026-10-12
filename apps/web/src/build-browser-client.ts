import type { ContractClient } from '@heynixie/contract';
import { clientHeaderName } from '@heynixie/contract';
import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import { makeWatchedFetch } from './make-watched-fetch';

// The API sends a keepalive into a quiet live stream every 5 s, so a stream that misses three in a
// row is dead.
const streamIdleMs = 15_000;

// The browser calls /rpc on its own origin, where the reverse proxy reaches nixie's API, so no
// call crosses origins. The browser attaches the HttpOnly session cookie itself; this client never
// reads or sets it.
export function buildBrowserClient(): ContractClient {
  return createORPCClient<ContractClient>(
    new RPCLink({
      fetch: makeWatchedFetch({ idleMs: streamIdleMs }),
      headers: { [clientHeaderName]: 'web' },
      url: () => new URL('/rpc', globalThis.location.href),
    }),
  );
}
