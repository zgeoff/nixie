import type { ContractClient } from '@heynixie/contract';
import { clientHeaderName, liveStreamTiming } from '@heynixie/contract';
import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import { makeWatchedFetch } from './make-watched-fetch';

export function buildBrowserClient(): ContractClient {
  return createORPCClient<ContractClient>(
    new RPCLink({
      fetch: makeWatchedFetch({
        idleMs: liveStreamTiming.idleLimitMs,
        isStreamRequest: isLiveStreamRequest,
      }),
      headers: { [clientHeaderName]: 'web' },
      url: () => new URL('/rpc', globalThis.location.href),
    }),
  );
}

function isLiveStreamRequest(request: Request): boolean {
  return new URL(request.url).pathname.endsWith('/rpc/live/follow');
}
