import { expect, test } from 'bun:test';
import { buildTestOAuthSpec } from '../test-utils/build-test-connector';
import { buildConsentURL } from './build-consent-url';

test('it asks for the identity scopes and every scope with state, PKCE S256 and the connector’s parameters', () => {
  const url = new URL(
    buildConsentURL(
      buildTestOAuthSpec({
        authorizeURL: 'https://accounts.google.com/o/oauth2/v2/auth',
        tokenURL: 'https://oauth2.googleapis.com/token',
        revokeURL: 'https://oauth2.googleapis.com/revoke',
        issuer: 'https://accounts.google.com',
        apiOrigin: 'https://www.googleapis.com',
      }),
      {
        clientID: 'client-123',
        redirectURI: 'https://nixie.example.org/connections/google/return',
        state: 'a-state',
        challenge: 'a-challenge',
      },
    ),
  );

  expect([url.origin + url.pathname, Object.fromEntries(url.searchParams)]).toStrictEqual([
    'https://accounts.google.com/o/oauth2/v2/auth',
    {
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
      client_id: 'client-123',
      redirect_uri: 'https://nixie.example.org/connections/google/return',
      response_type: 'code',
      scope:
        'openid email https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.calendarlist.readonly https://www.googleapis.com/auth/drive.file',
      state: 'a-state',
      code_challenge: 'a-challenge',
      code_challenge_method: 'S256',
    },
  ]);
});
