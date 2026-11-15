import type { APISettings } from '../types';
import { deriveSecretHash } from '../utils/derive-secret-hash';

// A read-only token is one whose hash the deployment config lists. nixie never issues one, so no
// row of the identity record holds it.
export function isReadOnlyToken(
  settings: Pick<APISettings, 'readOnlyTokenHashes'>,
  token: string | undefined,
): boolean {
  if (token === undefined || token === '' || settings.readOnlyTokenHashes.length === 0) {
    return false;
  }

  return settings.readOnlyTokenHashes.includes(deriveSecretHash(token));
}
