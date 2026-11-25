import { CredentialRemovedError, TokenRequestError } from '@heynixie/credentials';
import type { FinishConsentResult } from '../types';

// What a failed token exchange tells the owner, or null for an error nobody planned for. Google's
// answer comes through as a code from a fixed set, never as free text.
export function pickExchangeFailure(
  error: unknown,
): Extract<
  FinishConsentResult,
  { kind: 'token_exchange_failed' | 'no_refresh_token' | 'consent_not_found' }
> | null {
  if (error instanceof TokenRequestError) {
    return error.code === 'no_refresh_token'
      ? { kind: 'no_refresh_token' }
      : { kind: 'token_exchange_failed', googleError: error.providerError ?? error.code };
  }

  if (error instanceof CredentialRemovedError) {
    return { kind: 'consent_not_found' };
  }

  return null;
}
