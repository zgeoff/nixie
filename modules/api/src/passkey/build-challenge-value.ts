import { buildCanonicalBinding } from './build-canonical-binding';
import type { ChallengeFor } from './challenge-for';

export interface ChallengeParts {
  readonly randomBytes: Uint8Array;
  readonly identityID: string;
  readonly binding: ChallengeFor;
}

// SHA-256 over the random bytes, the session's identity ID and the canonical binding. The random
// bytes keep the value unguessable, and the other parts tie it to one answer from one session.
export function buildChallengeValue(parts: ChallengeParts): string {
  return new Bun.CryptoHasher('sha256')
    .update(parts.randomBytes)
    .update(parts.identityID)
    .update(buildCanonicalBinding(parts.binding))
    .digest('base64url');
}
