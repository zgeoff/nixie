import type { OAuthProvider } from '../types';

// The fields of a token or revoke request that name the client and the resource: the client ID, the
// secret only for a confidential client, and the resource when the provider names one.
export function buildClientFields(
  provider: OAuthProvider,
  clientSecret: string,
): Record<string, string> {
  return {
    client_id: provider.clientID,
    ...(clientSecret === '' ? {} : { client_secret: clientSecret }),
    ...(provider.resource === undefined ? {} : { resource: provider.resource }),
  };
}
