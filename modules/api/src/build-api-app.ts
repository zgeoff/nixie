import { clientHeaderName, sessionCookieName } from '@heynixie/contract';
import { RPCHandler } from '@orpc/server/fetch';
import { ResponseHeadersPlugin } from '@orpc/server/plugins';
import { Elysia } from 'elysia';
import { buildAPIRouter } from './build-api-router';
import type { APIContext, APIRequestContext } from './types';

interface RouteContext {
  readonly request: Request;
}

// Builds the API's Elysia app, which serves every procedure and the live stream under /rpc. A call
// without the custom client header is refused before any procedure runs, because a cross-site form
// cannot send one. The server mounts the app and listens.
export function buildAPIApp(context: APIContext) {
  const handler = new RPCHandler(buildAPIRouter(context), {
    plugins: [new ResponseHeadersPlugin()],
  });

  return new Elysia().all(
    '/rpc*',
    async (route: RouteContext) => {
      const request = route.request;

      if ((request.headers.get(clientHeaderName) ?? '') === '') {
        return new Response('the client header is missing', { status: 403 });
      }
      const result = await handler.handle(request, {
        context: findSessionToken(request.headers),
        prefix: '/rpc',
      });

      return result.matched ? result.response : new Response('not found', { status: 404 });
    },
    { parse: 'none' },
  );
}

// a bearer token wins over the cookie, so a server render forwards exactly the browser's session
function findSessionToken(headers: Headers): APIRequestContext {
  const bearer = /^Bearer (?<token>\S+)$/u.exec(headers.get('authorization') ?? '');

  if (bearer?.groups?.['token'] !== undefined) {
    return { sessionToken: bearer.groups['token'], tokenSource: 'bearer' };
  }
  for (const pair of (headers.get('cookie') ?? '').split(';')) {
    const [name, ...value] = pair.trim().split('=');

    if (name === sessionCookieName && value.length > 0) {
      return { sessionToken: value.join('='), tokenSource: 'cookie' };
    }
  }
  return { sessionToken: undefined, tokenSource: 'none' };
}
