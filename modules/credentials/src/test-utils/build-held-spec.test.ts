import { expect, test } from 'bun:test';
import { buildHeldSpec } from './build-held-spec';
import type { FakeOAuthProvider } from './start-fake-oauth-provider';

test('it builds a spec whose origin and endpoints are the provider’s', () => {
  const provider: FakeOAuthProvider = {
    host: 'auth.test',
    origin: 'https://auth.test:4443',
    apiOrigin: 'https://api.test:4443',
    ca: '',
    tokenURL: 'https://auth.test:4443/token',
    revokeURL: 'https://auth.test:4443/revoke',
    requests: [],
    answerToken: () => {},
    answerRevoke: () => {},
  };

  expect(buildHeldSpec(provider, 'oauth_token')).toStrictEqual({
    kind: 'oauth_token',
    label: 'Example account',
    origins: ['https://auth.test:4443', 'https://api.test:4443'],
    provider: {
      tokenURL: 'https://auth.test:4443/token',
      revokeURL: 'https://auth.test:4443/revoke',
      issuer: 'https://issuer.example',
      clientID: 'client-123',
    },
  });
});
