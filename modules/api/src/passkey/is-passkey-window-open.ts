import type { APIContext } from '../types';
import { alwaysAskKinds } from './always-ask-kinds';
import type { ChallengeFor } from './challenge-for';

// Whether a tap of the session still covers the check. An always-ask check is never covered.
export function isPasskeyWindowOpen(
  context: Pick<APIContext, 'clock' | 'passkeys'>,
  identityID: string,
  binding: ChallengeFor,
): boolean {
  if (alwaysAskKinds.has(binding.kind)) {
    return false;
  }

  const closesAtMs = context.passkeys.windows.get(identityID);

  return closesAtMs !== undefined && context.clock.now() < closesAtMs;
}
