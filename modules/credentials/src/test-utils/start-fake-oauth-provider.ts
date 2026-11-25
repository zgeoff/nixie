import { startTestSite } from '@heynixie/egress/test-utils';

export interface FakeProviderRequest {
  // the host name the request asked for
  readonly host: string;
  readonly path: string;
  readonly form: Readonly<Record<string, string>>;
  readonly authorization: string | null;
}

type Responder = (request: FakeProviderRequest) => Response | Promise<Response>;

export interface FakeOAuthProvider {
  readonly host: string;
  readonly origin: string;
  readonly ca: string;
  readonly tokenURL: string;
  readonly revokeURL: string;
  readonly requests: readonly FakeProviderRequest[];

  // replaces how the token endpoint answers from the next request on
  readonly answerToken: (responder: Responder) => void;
  readonly answerRevoke: (responder: Responder) => void;
}

// A real HTTPS site on the loopback address that plays an OAuth provider's token and revoke
// endpoints. The credentials module reaches it through its pinned connection, as in a release build.
// By default each token request gets a fresh access and refresh token.
export async function startFakeOAuthProvider(
  options: { readonly otherNames?: readonly string[] } = {},
): Promise<FakeOAuthProvider> {
  const requests: FakeProviderRequest[] = [];
  const host = 'auth.test';
  let issued = 0;

  const responders: Record<'token' | 'revoke', Responder> = {
    token: () => {
      issued += 1;

      return Response.json({
        access_token: `fake-access-token-${String(issued)}`,
        refresh_token: `fake-refresh-token-${String(issued)}`,
        expires_in: 3600,
      });
    },
    revoke: () => new Response(null, { status: 200 }),
  };

  const site = await startTestSite({
    names: [host, ...(options.otherNames ?? [])],
    respond: async (request) => {
      const url = new URL(request.url);

      const path = url.pathname;

      const isForm =
        request.headers.get('content-type')?.startsWith('application/x-www-form') ?? false;

      const data = isForm ? await request.formData() : new FormData();
      const entries = [...data.entries()];
      const form = Object.fromEntries(entries.map(([name, entry]) => [name, String(entry)]));

      const received = {
        host: url.hostname,
        path,
        form,
        authorization: request.headers.get('authorization'),
      };

      requests.push(received);

      return responders[path === '/revoke' ? 'revoke' : 'token'](received);
    },
  });

  const origin = `https://${host}:${String(site.port)}`;

  return {
    host,
    origin,
    ca: site.ca,
    tokenURL: `${origin}/token`,
    revokeURL: `${origin}/revoke`,
    requests,
    answerToken: (responder) => {
      responders.token = responder;
    },
    answerRevoke: (responder) => {
      responders.revoke = responder;
    },
  };
}
