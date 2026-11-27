import type { OAuthSpec } from '../connector/types';

// Where the provider takes requests, and who its ID tokens name as the issuer. Built from the connector's
// own OAuth spec, so the two never drift apart.
export interface ProviderEndpoints {
  // the provider's name, as the owner reads it
  readonly name: string;
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
    name: spec.name,
    tokenURL: spec.tokenURL,
    revokeURL: spec.revokeURL,
    authorizeURL: spec.authorizeURL,
    issuer: spec.issuer,
    origins: [...new Set([spec.tokenURL, spec.revokeURL].map((url) => new URL(url).origin))],
    apiOrigins: [...new Set(spec.origins.map((url) => new URL(url).origin))],
    returnPath: spec.returnPath,
  };
}
