import type { OAuthSpec } from '../connector/types';

export interface ConsentURLInput {
  readonly clientID: string;
  readonly redirectURI: string;
  readonly state: string;
  readonly challenge: string;
}

// The URL of Google's consent page. It asks for the identity scopes and every scope of the
// connector, with `state`, PKCE S256 and the connector's own parameters. A parameter the connector
// sets never replaces one nixie sets.
export function buildConsentURL(spec: OAuthSpec, input: ConsentURLInput): string {
  const url = new URL(spec.authorizeURL);

  const scopes = [
    ...spec.identityScopes,
    ...spec.scopes.map((scope) => `${spec.scopePrefix}${scope}`),
  ];

  for (const [name, value] of Object.entries(spec.authorizeParams)) {
    url.searchParams.set(name, value);
  }

  url.searchParams.set('client_id', input.clientID);
  url.searchParams.set('redirect_uri', input.redirectURI);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', scopes.join(' '));
  url.searchParams.set('state', input.state);
  url.searchParams.set('code_challenge', input.challenge);
  url.searchParams.set('code_challenge_method', 'S256');

  return url.href;
}
