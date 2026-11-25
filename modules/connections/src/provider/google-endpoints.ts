import type { OAuthSpec } from '@heynixie/connectors';
import { buildGoogleOAuthSpec, googleHosts } from '@heynixie/connectors';

// Where Google takes requests, and who its ID tokens name as the issuer. Built from the connector's
// own OAuth spec, so the two never drift apart.
export interface ProviderEndpoints {
  readonly tokenURL: string;
  readonly revokeURL: string;
  readonly authorizeURL: string;
  readonly issuer: string;

  // the origins that the token and revoke requests reach
  readonly origins: readonly string[];

  // the origins of the provider's APIs, which a connection's fetcher reaches
  readonly apiOrigins: readonly string[];
  readonly returnPath: string;
}

export function buildProviderEndpoints(spec: OAuthSpec): ProviderEndpoints {
  return {
    tokenURL: spec.tokenURL,
    revokeURL: spec.revokeURL,
    authorizeURL: spec.authorizeURL,
    issuer: spec.issuer,
    origins: [...new Set([spec.tokenURL, spec.revokeURL].map((url) => new URL(url).origin))],
    apiOrigins: [...new Set(spec.origins.map((url) => new URL(url).origin))],
    returnPath: spec.returnPath,
  };
}

export const googleEndpoints: ProviderEndpoints = buildProviderEndpoints(
  buildGoogleOAuthSpec(googleHosts),
);
