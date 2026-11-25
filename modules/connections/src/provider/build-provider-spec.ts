import type { CredentialSpec } from '@heynixie/credentials';
import type { ProviderEndpoints } from './google-endpoints';

export interface ProviderSpecOptions {
  readonly kind: 'oauth_client' | 'oauth_token';

  // the OAuth client's public ID, which the provider's ID tokens name as their audience
  readonly clientID: string;
}

// The spec every binding of Google carries, the client's and each connection's. Its origins are the
// token and revoke hosts that a refresh reaches, and the API hosts that a connection's fetcher may
// reach; the fetcher refuses the token, revoke and authorize hosts to a tool whatever the origins.
export function buildProviderSpec(
  endpoints: ProviderEndpoints,
  options: ProviderSpecOptions,
): CredentialSpec {
  return {
    kind: options.kind,
    label: 'Google connection',
    origins: [...new Set([...endpoints.origins, ...endpoints.apiOrigins])],
    provider: {
      tokenURL: endpoints.tokenURL,
      revokeURL: endpoints.revokeURL,
      authorizeURL: endpoints.authorizeURL,
      issuer: endpoints.issuer,
      clientID: options.clientID,
    },
  };
}
