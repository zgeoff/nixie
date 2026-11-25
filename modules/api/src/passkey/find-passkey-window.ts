import type { APIContext } from '../types';
import { alwaysAskKinds } from './always-ask-kinds';
import type { ChallengeFor } from './challenge-for';

interface WindowQuery {
  readonly identityID: string;
  readonly binding: ChallengeFor;
  readonly livePasskeyIDs: readonly string[];
}

// The ID of the passkey whose tap still covers the check, or null. An always-ask check is never
// covered, and a window whose passkey is no longer live covers nothing.
export function findPasskeyWindow(
  context: Pick<APIContext, 'clock' | 'passkeys'>,
  query: WindowQuery,
): string | null {
  if (alwaysAskKinds.has(query.binding.kind)) {
    return null;
  }

  const window = context.passkeys.windows.get(query.identityID);

  if (
    window === undefined ||
    context.clock.now() >= window.closesAtMs ||
    !query.livePasskeyIDs.includes(window.passkeyID)
  ) {
    return null;
  }

  return window.passkeyID;
}
