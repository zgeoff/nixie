import { buildIDToken } from '@heynixie/credentials/test-utils';
import { buildTestGoogleHosts } from '../test/build-test-google-hosts';

export interface FakeGoogleSite {
  // the loopback address a test build reaches Google's endpoints at
  readonly url: string;

  readonly stop: () => Promise<void>;
}

// A Google that grants every scope to one account. Its authorize page sends the browser straight
// back with a code, its token endpoint answers a code with tokens and an ID token, and every other
// path answers 200 with an empty body, as a scope's read call does.
export function startFakeGoogleSite(): FakeGoogleSite {
  const site = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    fetch: answerRequest,
  });

  return { url: `http://127.0.0.1:${String(site.port)}`, stop: () => site.stop(true) };
}

async function answerRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);

  if (request.method === 'GET' && url.pathname === '/authorize') {
    return answerAuthorize(url);
  }

  if (request.method === 'POST' && url.pathname === '/token') {
    const body = await request.text();

    return answerToken(new URLSearchParams(body), url.origin);
  }

  return Response.json({});
}

function answerAuthorize(url: URL): Response {
  const redirectURI = url.searchParams.get('redirect_uri');
  const state = url.searchParams.get('state');

  if (redirectURI === null || state === null) {
    return new Response('The authorize request names no redirect URI or state', { status: 400 });
  }

  const back = new URL(redirectURI);

  back.searchParams.set('state', state);
  back.searchParams.set('code', 'verify-code');

  return new Response(null, { status: 302, headers: { location: back.href } });
}

const scopePrefix = 'https://www.googleapis.com/auth/';

const grantedScopes = [
  'gmail.modify',
  'calendar.events',
  'calendar.calendarlist.readonly',
  'drive.file',
];

function answerToken(form: URLSearchParams, siteURL: string): Response {
  if (form.get('grant_type') === 'refresh_token') {
    return Response.json({
      access_token: `verify-access-${crypto.randomUUID()}`,
      expires_in: 3600,
    });
  }

  const issuer = buildTestGoogleHosts(siteURL).issuer;

  return Response.json({
    access_token: `verify-access-${crypto.randomUUID()}`,
    refresh_token: `verify-refresh-${crypto.randomUUID()}`,
    expires_in: 3600,
    scope: ['openid', 'email', ...grantedScopes.map((scope) => `${scopePrefix}${scope}`)].join(' '),
    id_token: buildIDToken({
      iss: issuer,
      aud: form.get('client_id'),
      exp: Date.now() / 1000 + 3600,
      sub: 'verify-account',
      email: 'verify@example.test',
    }),
  });
}
