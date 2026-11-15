import type { ChallengeFor } from './challenge-for';
import { toBindingPayload } from './to-binding-payload';

// One text for each binding, so two equal bindings give the same text and hash.
export function buildCanonicalBinding(binding: ChallengeFor): string {
  return JSON.stringify(toBindingPayload(binding));
}
