import { RPCHandler } from '@orpc/server/fetch';
import { createHostRouter } from './create-host-router';
import type { HostRouterOptions } from './types';

type HostResponder = (request: Request) => Promise<Response>;

export function makeHostResponder(options: HostRouterOptions): HostResponder {
  const handler = new RPCHandler(createHostRouter(options));

  return async (request) => {
    const result = await handler.handle(request, { prefix: '/rpc' });

    return result.matched ? result.response : new Response('not found', { status: 404 });
  };
}
