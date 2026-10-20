import { RPCHandler } from '@orpc/server/fetch';
import { createHostRouter } from './create-host-router';
import type { HostRouterOptions } from './types';

type HostResponder = (request: Request) => Promise<Response>;

// Makes the function that answers each request on the control socket: a call of a host procedure
// under /rpc, or 404 for any other request.
export function makeHostResponder(options: HostRouterOptions): HostResponder {
  const handler = new RPCHandler(createHostRouter(options));

  return async (request) => {
    const result = await handler.handle(request, { prefix: '/rpc' });

    return result.matched ? result.response : new Response('not found', { status: 404 });
  };
}
