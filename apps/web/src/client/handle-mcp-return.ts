import type { ContractClient } from '@heynixie/contract';
import { clientHeaderName, sessionCookieName } from '@heynixie/contract';
import { ORPCError, createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import { buildForwardHeaders } from './build-forward-headers';
import { renderReturnError } from './render-return-error';

export const mcpReturnPath = '/connections/mcp/return';
const returnHeaders = { 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' } as const;

// Finishes a sign-in that an MCP server's authorization server sent the browser back from, as the
// browser's own session. The query string holds the state and the code, so nothing here logs the URL.
export async function handleMcpReturn(apiURL: string, request: Request): Promise<Response> {
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
    return renderReturnError(400, 'SIGN_IN_NOT_FOUND', null);
  }

  try {
    await client.mcp.finishSignIn({
      state,
      code: query.get('code'),
      error: query.get('error'),
      iss: query.get('iss'),
    });

    return new Response(null, {
      status: 303,
      headers: { ...returnHeaders, location: '/settings/connections' },
    });
  } catch (error) {
    return error instanceof ORPCError
      ? renderReturnError(400, String(error.code), null)
      : renderReturnError(502, 'API_UNREACHABLE', null);
  }
}
