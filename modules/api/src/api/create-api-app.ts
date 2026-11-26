import { clientHeaderName, liveStreamTiming } from '@heynixie/contract';
import type { DefinitionsContext } from '@heynixie/definitions';
import { RPCHandler } from '@orpc/server/fetch';
import { ResponseHeadersPlugin } from '@orpc/server/plugins';
import { Elysia } from 'elysia';
import { answerPageRequest } from '../device/answer-page-request';
import type { ProposalParts } from '../proposal/build-proposal-core-deps';
import { findSessionToken } from '../session/find-session-token';
import { isDeviceProcedure } from '../session/is-device-procedure';
import { isReadOnlyProcedure } from '../session/is-read-only-procedure';
import { isReadOnlyToken } from '../session/is-read-only-token';
import { readSessionScope } from '../session/read-session-scope';
import type { APIContext } from '../types';
import { createAPIRouter } from './create-api-router';

interface RouteContext {
  readonly request: Request;
}

export function createAPIApp(
  context: APIContext,
  parts: ProposalParts,
  readDefinitions: () => DefinitionsContext | null,
) {
  const handler = new RPCHandler(createAPIRouter(context, parts, readDefinitions), {
    eventIteratorKeepAliveInterval: liveStreamTiming.keepAliveMs,
    plugins: [new ResponseHeadersPlugin()],
  });

  return new Elysia().all(
    '/rpc*',

    async (route: RouteContext) => {
      const request = route.request;

      // A page's frame sends no session and no client header, so its two paths answer by ticket
      // before the checks that need them.
      const page = answerPageRequest(context, request);

      if (page !== null) {
        return page;
      }

      // A cross-site form cannot send a custom header, so the API refuses a call without one.
      if ((request.headers.get(clientHeaderName) ?? '') === '') {
        return new Response('the client header is missing', { status: 403 });
      }

      const session = findSessionToken(request.headers);

      if (
        isReadOnlyToken(context.settings, session.sessionToken) &&
        !isReadOnlyProcedure(new URL(request.url).pathname)
      ) {
        return new Response('this token only reads', { status: 403 });
      }

      if (
        !isDeviceProcedure(new URL(request.url).pathname) &&
        (await readSessionScope(context, session.sessionToken)) === 'device'
      ) {
        return new Response('a device session only follows its own device', { status: 403 });
      }

      const result = await handler.handle(request, {
        context: session,
        prefix: '/rpc',
      });

      return result.matched ? result.response : new Response('not found', { status: 404 });
    },
    { parse: 'none' },
  );
}
