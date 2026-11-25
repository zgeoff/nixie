import type { PasskeyFailure, PasskeyRefusal } from '@heynixie/proposals';
import type { Transaction } from 'kysely';
import type { APIContext, Identity } from '../types';
import type { Assertion, ChallengeFor } from './challenge-for';
import { createPasskeyCheck } from './create-passkey-check';
import { isPasskeyWindowOpen } from './is-passkey-window-open';
import { openPasskeyWindow } from './open-passkey-window';
import { readLivePasskeys } from './read-live-passkeys';

interface PasskeyRequest {
  readonly caller: Identity;
  readonly binding: ChallengeFor;
  readonly assertion: Assertion | undefined;
}

// passkeyID is null when the session's open window covered the check and no assertion ran
export type PasskeyOutcome =
  | { readonly passkeyID: string | null }
  | PasskeyRefusal
  | { readonly error: 'PASSKEY_FAILED'; readonly reason: PasskeyFailure };

// The one passkey check, which every gated path calls inside its write transaction. It refuses in
// this order: no live passkey, then no assertion with no open window, then a failed assertion. A
// passed assertion opens the session's window. A check that the window covers writes nothing.
export async function checkPasskey(
  context: APIContext,
  tx: Transaction<unknown>,
  request: PasskeyRequest,
): Promise<PasskeyOutcome> {
  const live = await readLivePasskeys(tx);

  if (live.length === 0) {
    return { error: 'NO_PASSKEY' };
  }

  if (request.assertion === undefined) {
    return isPasskeyWindowOpen(context, request.caller.identityID, request.binding)
      ? { passkeyID: null }
      : { error: 'PASSKEY_REQUIRED' };
  }

  const verdict = await createPasskeyCheck(context).verify(
    tx,
    request.caller,
    request.binding,
    request.assertion,
  );

  if ('error' in verdict) {
    return verdict;
  }

  openPasskeyWindow(context, request.caller.identityID);

  return verdict;
}
