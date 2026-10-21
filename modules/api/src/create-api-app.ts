import { clientHeaderName, sessionCookieName } from '@heynixie/contract';
import { RPCHandler } from '@orpc/server/fetch';
import { ResponseHeadersPlugin } from '@orpc/server/plugins';
import { Elysia } from 'elysia';
import { createAPIRouter } from './create-api-router';
import type { APIContext, APIRequestContext, ReadViewMemory } from './types';

interface RouteContext {
  readonly request: Request;
}

export function createAPIApp(context: APIContext, readMemory: ReadViewMemory) {
  const handler = new RPCHandler(createAPIRouter(context, readMemory), {
    // The web client treats a live stream that misses three keepalives in a row as dead.
    eventIteratorKeepAliveInterval: 5000,
    plugins: [new ResponseHeadersPlugin()],
  });

  return new Elysia().all(
    '/rpc*',

    async (route: RouteContext) => {
      const request = route.request;

      // A cross-site form cannot send a custom header, so the API refuses a call without one.
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

// A server render forwards the browser's session as a bearer token, so the bearer token wins over
// the cookie.
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
