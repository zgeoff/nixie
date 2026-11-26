import type { ProviderResponse } from '../types';
import type { GoogleCall } from './call-google';

// What a Google error means for an action. A quota answer retries, a server error leaves the outcome
// unknown because the call may have gone through, and any other refusal ends the action.
export function pickGoogleErrorResponse(
  reply: Extract<GoogleCall, { readonly kind: 'error' }>,
): ProviderResponse {
  if (reply.isRateLimit) {
    return {
      kind: 'refused_retryable',
      reason: reply.reason,
      ...(reply.retryAfterMs === null ? {} : { retryAfterMs: reply.retryAfterMs }),
    };
  }

  return reply.status >= 500
    ? { kind: 'ambiguous', reason: reply.reason }
    : { kind: 'refused', reason: reply.reason };
}
