import type { CredentialFetch, OAuthProvider } from '../types';
import { buildClientFields } from './build-client-fields';
import type { RevokeResult } from './types';

export interface RevocationSender {
  readonly makeProviderFetch: (
    provider: OAuthProvider,
    bodyValues: readonly string[],
  ) => CredentialFetch;
  readonly requestTimeoutMs: number;
}

// One request to the provider's revoke URL. 200 is confirmed, 400 is refused, and any other answer,
// or none, is unknown.
export async function sendRevocation(
  sender: RevocationSender,
  provider: OAuthProvider,
  clientSecret: string,
  token: string,
): Promise<RevokeResult> {
  if (provider.revokeURL === undefined) {
    return { outcome: 'not_attempted', status: null, providerError: null };
  }

  const send = sender.makeProviderFetch(provider, [clientSecret, token]);

  try {
    const response = await send(provider.revokeURL, {
      method: 'POST',
      body: new URLSearchParams({ token, ...buildClientFields(provider, clientSecret) }),
      signal: AbortSignal.timeout(sender.requestTimeoutMs),
    });

    if (response.status === 200) {
      return { outcome: 'confirmed', status: response.status, providerError: null };
    }

    if (response.status === 400) {
      return {
        outcome: 'refused',
        status: 400,
        providerError: await readProviderError(response),
      };
    }

    return { outcome: 'unknown', status: response.status, providerError: null };
  } catch {
    return { outcome: 'unknown', status: null, providerError: null };
  }
}

// The error codes of RFC 7009 and RFC 6749 that a revoke endpoint answers with. Any other text is
// dropped, so a free-form reply never reaches a record.
const knownProviderErrors = new Set([
  'invalid_request',
  'invalid_client',
  'invalid_grant',
  'invalid_token',
  'unauthorized_client',
  'unsupported_token_type',
]);

async function readProviderError(response: Response): Promise<string | null> {
  try {
    const body: unknown = await response.json();

    if (typeof body === 'object' && body !== null && 'error' in body) {
      const code = body.error;

      return typeof code === 'string' && knownProviderErrors.has(code) ? code : null;
    }
  } catch {
    return null;
  }

  return null;
}
