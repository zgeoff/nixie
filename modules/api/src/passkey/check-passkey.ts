import { queueCommitHook } from '@heynixie/log';
import type { PasskeyFailure, PasskeyRefusal } from '@heynixie/proposals';
import type { Transaction } from 'kysely';
import type { APIContext, Identity } from '../types';
import type { Assertion, ChallengeFor } from './challenge-for';
import { createPasskeyCheck } from './create-passkey-check';
import { findPasskeyWindow } from './find-passkey-window';
import { openPasskeyWindow } from './open-passkey-window';
import { readLivePasskeys } from './read-live-passkeys';

interface PasskeyRequest {
  readonly caller: Identity;
  readonly binding: ChallengeFor;
  readonly assertion: Assertion | undefined;
}

// passkeyID is the passkey whose assertion passed, or, when an open window covered the check and
// no assertion ran, the passkey that opened the window
export type PasskeyOutcome =
  | { readonly passkeyID: string }
  | PasskeyRefusal
  | { readonly error: 'PASSKEY_FAILED'; readonly reason: PasskeyFailure };

// The one passkey check, which every gated path calls inside its write transaction. A passed
// assertion opens the session's window once the transaction commits, so a rollback leaves it shut.
// A check that the window covers writes nothing.
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
    const passkeyID = findPasskeyWindow(context, {
      identityID: request.caller.identityID,
      binding: request.binding,
      livePasskeyIDs: live.map((row) => row.passkey_id),
    });

    return passkeyID === null ? { error: 'PASSKEY_REQUIRED' } : { passkeyID };
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

  queueCommitHook(tx, () => {
    openPasskeyWindow(context, {
      identityID: request.caller.identityID,
      passkeyID: verdict.passkeyID,
    });
  });

  return verdict;
}
