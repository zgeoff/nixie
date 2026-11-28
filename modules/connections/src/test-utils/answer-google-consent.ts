import { buildIDToken } from '@heynixie/credentials/test-utils';
import type { FakeOAuthProvider } from '@heynixie/credentials/test-utils';

export interface FakeGoogleAccount {
  // the account's ID at Google, and its address
  readonly sub: string;

  // none answers an ID token that holds no address
  readonly email?: string;

  // the scopes Google says it granted, in short names; identity scopes are added
  readonly scopes: readonly string[];

  // false answers the code with no refresh token, as Google does for a grant the owner made before
  readonly hasRefreshToken: boolean;

  // how long the grant lasts, in seconds, as a grant of limited time does; none for a grant that
  // never ends
  readonly refreshExpiresInSeconds?: number;
}

export interface FakeGoogle {
  // the account each authorization code belongs to
  readonly accounts: Map<string, FakeGoogleAccount>;

  // the form of each authorization-code request, which a test checks for its verifier and secret
  readonly codeRequests: Record<string, string>[];

  // what the API paths answer; every path not listed answers 200
  readonly apiAnswers: Map<string, { readonly status: number; readonly body: string }>;
}

export interface FakeGoogleOptions {
  // the OAuth client's public ID, which Google writes in each ID token as the audience
  readonly clientID: string;
  readonly nowMs: () => number;
}

// Makes the fake provider answer as Google does: an authorization code gives the tokens and the ID
// token of the account the code belongs to, a refresh gives a new access token, and each API path
// answers 200 unless the test says otherwise.
export function answerGoogleConsent(
  provider: FakeOAuthProvider,
  options: FakeGoogleOptions,
): FakeGoogle {
  const google: FakeGoogle = {
    accounts: new Map(),
    codeRequests: [],
    apiAnswers: new Map(),
  };

  let issued = 0;

  provider.answerToken((request) => {
    if (request.path !== '/token') {
      const answer = google.apiAnswers.get(request.path);

      return answer === undefined
        ? Response.json({})
        : new Response(answer.body, { status: answer.status });
    }

    issued += 1;

    if (request.form['grant_type'] === 'refresh_token') {
      return Response.json({ access_token: `google-access-${String(issued)}`, expires_in: 3600 });
    }

    google.codeRequests.push({ ...request.form });

    const account = google.accounts.get(request.form['code'] ?? '');

    if (account === undefined) {
      return Response.json({ error: 'invalid_grant' }, { status: 400 });
    }

    return Response.json({
      access_token: `google-access-${String(issued)}`,
      expires_in: 3600,
      ...(account.hasRefreshToken ? { refresh_token: `google-refresh-${String(issued)}` } : {}),
      ...(account.refreshExpiresInSeconds === undefined
        ? {}
        : { refresh_token_expires_in: account.refreshExpiresInSeconds }),
      scope: [
        'openid',
        'email',
        ...account.scopes.map((scope) => `https://www.googleapis.com/auth/${scope}`),
      ].join(' '),
      id_token: buildIDToken({
        iss: 'https://issuer.example',
        aud: options.clientID,
        exp: options.nowMs() / 1000 + 3600,
        sub: account.sub,
        ...(account.email === undefined ? {} : { email: account.email }),
      }),
    });
  });

  return google;
}
