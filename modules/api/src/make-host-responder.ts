import { RPCHandler } from '@orpc/server/fetch';
import { buildHostRouter } from './build-host-router';
import type { HostRouterOptions } from './types';

// Makes the function that answers each request on the control socket: a call of a host procedure
// under /rpc, or 404 for any other request.
// oxlint-disable-next-line typescript/prefer-readonly-parameter-types -- a Request has no readonly form
export function makeHostResponder(
  options: HostRouterOptions,
): (request: Request) => Promise<Response> {
  const handler = new RPCHandler(buildHostRouter(options));

  return async (request) => {
    const result = await handler.handle(request, { prefix: '/rpc' });

    return result.matched ? result.response : new Response('not found', { status: 404 });
  };
}
