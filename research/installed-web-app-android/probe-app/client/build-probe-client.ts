import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import type { ContractRouterClient } from '@orpc/contract';
import { clientHeaderName, type probeContract, rpcPrefix } from '../src/contract.ts';

export type ProbeClient = ContractRouterClient<typeof probeContract>;

interface ProbeClientOptions {
  origin: string;
  // the send page adds the admin key
  headers?: Record<string, string>;
  // a test routes the calls into the probe's handler
  fetch?: (request: Request) => Promise<Response>;
}

// The page and the service worker call the probe the way nixie's web client calls its API: the
// custom header on every call, and the session cookie that the browser adds.
export function buildProbeClient(options: ProbeClientOptions): ProbeClient {
  const send = options.fetch;

  return createORPCClient(
    new RPCLink({
      url: `${options.origin}${rpcPrefix}`,
      headers: { [clientHeaderName]: 'probe', ...options.headers },
      ...(send === undefined
        ? {}
        : { fetch: (request: Request, init: RequestInit) => send(new Request(request, init)) }),
    }),
  );
}
