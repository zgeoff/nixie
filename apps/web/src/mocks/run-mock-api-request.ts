import { clientHeaderName, sessionCookieName } from '@heynixie/contract';
import { RPCHandler } from '@orpc/server/fetch';
import { ResponseHeadersPlugin } from '@orpc/server/plugins';
import { mockAPIRouter } from './mock-api-router';

const handler = new RPCHandler(mockAPIRouter, { plugins: [new ResponseHeadersPlugin()] });

// Answers one request as nixie's API would: it refuses a call without the custom client header,
// and it takes the device session from a bearer token or else from the session cookie.
export async function runMockAPIRequest(request: Request): Promise<Response> {
  if (request.headers.get(clientHeaderName) === null) {
    return new Response('the client header is missing', { status: 403 });
  }

  const result = await handler.handle(request, {
    context: { sessionToken: findSessionToken(request.headers) },
    prefix: '/rpc',
  });

  return result.matched ? result.response : new Response('not found', { status: 404 });
}

function findSessionToken(headers: Headers): string | undefined {
  const bearer = /^Bearer (?<token>\S+)$/u.exec(headers.get('authorization') ?? '');

  if (bearer?.groups?.['token'] !== undefined) {
    return bearer.groups['token'];
  }

  for (const pair of (headers.get('cookie') ?? '').split(';')) {
    const [name, value] = pair.trim().split('=');

    if (name === sessionCookieName && value !== undefined) {
      return value;
    }
  }

  return undefined;
}
