import type { ContractClient } from '@heynixie/contract';
import { clientHeaderName, sessionCookieName } from '@heynixie/contract';
import { ORPCError, createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import { z } from 'zod';
import { buildForwardHeaders } from './build-forward-headers';
import { renderReturnError } from './render-return-error';

export const googleReturnPath = '/connections/google/return';
const returnHeaders = { 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' } as const;

// Finishes a consent that Google sent the browser back from, as the browser's own session. The
// query string holds the state and the code, so nothing here logs the URL.
export async function handleGoogleReturn(apiURL: string, request: Request): Promise<Response> {
  const query = new URL(request.url).searchParams;

  const sessionToken = new Bun.CookieMap(request.headers.get('cookie') ?? '').get(
    sessionCookieName,
  );

  const client = createORPCClient<ContractClient>(
    new RPCLink({
      headers: { ...buildForwardHeaders(sessionToken ?? undefined), [clientHeaderName]: 'web' },
      url: `${apiURL}/rpc`,
    }),
  );

  const state = query.get('state');

  if (state === null || state === '') {
    return renderReturnError(400, 'CONSENT_NOT_FOUND', null);
  }

  try {
    const finished = await client.connections.finishConsent({
      state,
      code: query.get('code'),
      error: query.get('error'),
    });

    return new Response(null, {
      status: 303,
      headers: { ...returnHeaders, location: `/settings/connections/${finished.connection}` },
    });
  } catch (error) {
    return toReturnErrorResponse(error);
  }
}

const googleErrorSchema = z.object({ googleError: z.string().nullable() });

function toReturnErrorResponse(error: unknown): Response {
  if (!(error instanceof ORPCError)) {
    return renderReturnError(502, 'API_UNREACHABLE', null);
  }

  const googleError = googleErrorSchema.safeParse(error.data);
  const reported = googleError.success ? googleError.data.googleError : null;

  return renderReturnError(400, error.code, reported);
}
