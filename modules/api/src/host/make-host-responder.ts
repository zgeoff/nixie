import { RPCHandler } from '@orpc/server/fetch';
import type { HostRouterOptions } from '../types';
import { createHostRouter } from './create-host-router';

type HostResponder = (request: Request) => Promise<Response>;

export function makeHostResponder(options: HostRouterOptions): HostResponder {
  const handler = new RPCHandler(createHostRouter(options));

  return async (request) => {
    const result = await handler.handle(request, { prefix: '/rpc' });

    return result.matched ? result.response : new Response('not found', { status: 404 });
  };
}
