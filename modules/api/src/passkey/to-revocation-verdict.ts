import type { PasskeyOutcome } from './check-passkey';
import type { PasskeyVerdict } from './create-passkey-check';

// A revoke with no live passkey fails as the unknown passkey it would have named.
export function toRevocationVerdict(
  outcome: Exclude<Extract<PasskeyOutcome, { error: string }>, { error: 'PASSKEY_REQUIRED' }>,
): Extract<PasskeyVerdict, { error: string }> {
  return outcome.error === 'PASSKEY_FAILED'
    ? outcome
    : { error: 'PASSKEY_FAILED', reason: 'unknown_passkey' };
}
