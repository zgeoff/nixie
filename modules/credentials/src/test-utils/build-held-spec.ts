import type { CredentialSpec } from '../types';
import type { FakeOAuthProvider } from './start-fake-oauth-provider';

// The spec of an OAuth client or token whose provider is the fake one. The issuer is
// https://issuer.example and the client ID is client-123.
export function buildHeldSpec(
  provider: Pick<FakeOAuthProvider, 'origin' | 'tokenURL' | 'revokeURL'> & {
    readonly apiOrigin?: string;
  },
  kind: 'oauth_client' | 'oauth_token',
): CredentialSpec {
  return {
    kind,
    label: 'Example account',
    origins: [provider.origin, ...(provider.apiOrigin === undefined ? [] : [provider.apiOrigin])],
    provider: {
      tokenURL: provider.tokenURL,
      revokeURL: provider.revokeURL,
      issuer: 'https://issuer.example',
      clientID: 'client-123',
    },
  };
}
