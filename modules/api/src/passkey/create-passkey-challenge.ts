import type { APIContext, Identity } from '../types';
import { buildChallengeValue } from './build-challenge-value';
import type { ChallengeFor } from './challenge-for';
import { challengeLifetimeMs } from './passkey-state';
import { readLivePasskeys } from './read-live-passkeys';

export interface IssuedChallenge {
  readonly challenge: string;
  readonly rpId: string;
  readonly allowCredentials: readonly never[];
  readonly userVerification: 'required';
  readonly timeout: number;
}

interface ChallengeRequest {
  readonly caller: Identity;
  readonly binding: ChallengeFor;
}

// Issues a challenge bound to the caller's session and the one check it is for. Returns null when no
// passkey is live.
export async function createPasskeyChallenge(
  context: APIContext,
  request: ChallengeRequest,
): Promise<IssuedChallenge | null> {
  const [first] = await readLivePasskeys(context.log.writer.db);

  if (first === undefined) {
    return null;
  }

  const now = context.clock.now();

  for (const [value, pending] of context.passkeys.challenges) {
    if (now - pending.issuedAt >= challengeLifetimeMs) {
      context.passkeys.challenges.delete(value);
    }
  }

  const challenge = buildChallengeValue({
    randomBytes: crypto.getRandomValues(new Uint8Array(32)),
    identityID: request.caller.identityID,
    binding: request.binding,
  });

  context.passkeys.challenges.set(challenge, {
    identityID: request.caller.identityID,
    binding: request.binding,
    issuedAt: now,
  });

  return {
    challenge,
    rpId: first.rp_id,
    allowCredentials: [],
    userVerification: 'required',
    timeout: challengeLifetimeMs,
  };
}
